#!/usr/bin/env node
/**
 * Verifies a running private-beta stack from the OUTSIDE (P4-11): TLS, HTTP→HTTPS redirect, health, security headers,
 * correlation ids, internal routes blocked at the proxy, database not reachable, invitation-only sign-up.
 *   node scripts/release/verify-beta-stack.mjs --base https://beta.example.com [--out artifacts/phase-4/beta-infra]
 * For a LOCAL dry run against Caddy's internal CA, trust that CA instead of skipping validation:
 *   --ca-file <path to Caddy's root.crt, e.g. /data/caddy/pki/authorities/local/root.crt>
 * Certificate validation is never disabled (the old --insecure-local flag was removed; CodeQL alerts #8 and #15).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "https://localhost").replace(/\/+$/, "");
const OUT = arg("out", "artifacts/phase-4/beta-infra");
if (process.argv.includes("--insecure-local")) {
  console.error("--insecure-local was removed: certificate validation is never disabled. Trust a local CA with --ca-file <root.crt>");
  process.exit(2);
}
const caFile = arg("ca-file", undefined);
let ca;
if (caFile) {
  try {
    ca = readFileSync(caFile);
  } catch {
    console.error(`cannot read --ca-file ${caFile}`);
    process.exit(2);
  }
}
const host = new URL(BASE).hostname;
// Plain fetch cannot take a custom CA, so https goes through node:https with the trusted CA (system roots + --ca-file).
const send = (url, { method = "GET", headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = (u.protocol === "https:" ? https : http).request(u, { method, headers, ...(u.protocol === "https:" && ca ? { ca: [...tls.rootCertificates, ca.toString()] } : {}) }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode, headers: { get: (k) => [res.headers[k.toLowerCase()]].flat()[0] ?? null }, text, json: async () => JSON.parse(text) });
      });
    });
    r.on("error", reject);
    r.end(body);
  });
const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const connectable = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ host: host === "localhost" ? "127.0.0.1" : host, port, timeout: 3000 }, () => (s.destroy(), resolve(true)));
    s.on("error", () => resolve(false));
    s.on("timeout", () => (s.destroy(), resolve(false)));
  });

try {
  // TLS certificate
  const cert = await new Promise((resolve, reject) => {
    const s = tls.connect({ host: host === "localhost" ? "127.0.0.1" : host, port: 443, servername: host, ...(ca ? { ca: [...tls.rootCertificates, ca.toString()] } : {}) }, () => {
      const c = s.getPeerCertificate();
      resolve({ authorized: s.authorized, issuer: c.issuer?.CN ?? c.issuer?.O, validTo: c.valid_to, protocol: s.getProtocol() });
      s.end();
    });
    s.on("error", reject);
  });
  check("TLS certificate", cert.authorized, `${cert.protocol}, issuer ${cert.issuer}, valid to ${cert.validTo}${ca ? " (trusted via --ca-file)" : ""}`);

  const redirect = await fetch(`http://${host}/api/health`, { redirect: "manual" });
  check("HTTP redirects to HTTPS", [301, 302, 307, 308].includes(redirect.status) && (redirect.headers.get("location") ?? "").startsWith("https://"), `${redirect.status} → ${redirect.headers.get("location")}`);

  const h = await send(`${BASE}/api/health`);
  const hb = await h.json();
  check("health: db + worker ok over HTTPS", h.status === 200 && hb.db === "ok" && hb.worker === "ok", `revision ${String(hb.revision).slice(0, 7)} schema ${hb.schemaVersion}`);

  const home = await send(`${BASE}/`);
  const hdr = (k) => home.headers.get(k);
  check("security headers", Boolean(hdr("strict-transport-security") && hdr("x-content-type-options") === "nosniff" && hdr("x-frame-options") && hdr("referrer-policy")), ["strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy"].map((k) => `${k}=${hdr(k) ? "set" : "missing"}`).join(", "));
  check("no server banner", !hdr("server") && !hdr("x-powered-by"), `server=${hdr("server") ?? "-"} x-powered-by=${hdr("x-powered-by") ?? "-"}`);

  const api = await send(`${BASE}/api/auth-config`);
  check("correlation id on API responses", Boolean(api.headers.get("x-request-id")), api.headers.get("x-request-id") ?? "missing");

  for (const [path, method] of [["/api/ops/status", "GET"], ["/api/test/faults", "POST"]]) {
    const r = await send(`${BASE}${path}`, { method, headers: { authorization: "Bearer probe", origin: BASE } });
    check(`internal route blocked at the proxy: ${path}`, r.status === 404, `HTTP ${r.status}`);
  }

  for (const port of [5432, 3000, 11434]) {
    // A local dry run shares the machine with the developer's own services (e.g. Ollama on 11434): not the beta stack's.
    if (host === "localhost" && port === 11434) {
      checks.push({ name: "port 11434 not reachable from outside", ok: true, detail: "n/a on a local dry run (the developer's own Ollama); checked on the real host" });
      continue;
    }
    check(`port ${port} not reachable from outside`, !(await connectable(port)), port === 5432 ? "PostgreSQL" : port === 3000 ? "app port" : "Ollama");
  }

  // Invite-only must be positively shown: the configured mode, and an explicit refusal for a stranger. (A failed
  // sign-in alone proves nothing — unverified email, rate limits or an auth outage fail it too.)
  const cfg = await send(`${BASE}/api/auth-config`).then((r) => r.json()).catch(() => ({}));
  check("sign-up mode is invite_only", cfg.betaMode === "invite_only", `betaMode=${cfg.betaMode}`);
  const email = `stranger-${Date.now()}@flowline-verify.test`;
  const pre = await send(`${BASE}/api/beta/check`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email }) });
  const preBody = await pre.json().catch(() => ({}));
  check("uninvited email is refused by the beta check", pre.status === 200 && preBody.allowed === false, `HTTP ${pre.status} allowed=${preBody.allowed}`);
  const bad = await send(`${BASE}/api/beta/check`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email, code: "FL-NOT-A-REAL-CODE" }) });
  const badBody = await bad.json().catch(() => ({}));
  check("an invalid beta code is refused", bad.status === 200 && badBody.allowed === false, `HTTP ${bad.status} allowed=${badBody.allowed}`);
  // That the sign-up hook creates no user row is proven server-side by tests/integration/p4-beta-access.test.ts.
} catch (e) {
  check("verification completed", false, String(e.cause?.code ?? e.message).slice(0, 200));
}
const report = { base: BASE, caFile: caFile ?? null, at: new Date().toISOString(), checks, pass: checks.every((c) => c.ok) };
mkdirSync(OUT, { recursive: true });
const file = `${OUT}/verify-${host.replace(/[^a-z0-9.-]/gi, "_")}-${Date.now()}.json`;
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(report.pass ? "BETA STACK PASS" : "BETA STACK FAIL", "→", file);
process.exitCode = report.pass ? 0 : 1;
