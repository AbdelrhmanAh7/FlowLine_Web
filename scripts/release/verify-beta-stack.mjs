#!/usr/bin/env node
/**
 * Verifies a running private-beta stack from the OUTSIDE (P4-11): TLS, HTTP→HTTPS redirect, health, security headers,
 * correlation ids, internal routes blocked at the proxy, database not reachable, invitation-only sign-up.
 *   node scripts/release/verify-beta-stack.mjs --base https://beta.example.com [--out artifacts/phase-4/beta-infra]
 * For a LOCAL dry run against Caddy's internal CA, add --insecure-local (skips certificate validation; never for the real
 * beta domain — the real check must validate the Let's Encrypt certificate).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import net from "node:net";
import tls from "node:tls";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "https://localhost").replace(/\/+$/, "");
const OUT = arg("out", "artifacts/phase-4/beta-infra");
const insecure = process.argv.includes("--insecure-local");
if (insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const host = new URL(BASE).hostname;
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
    const s = tls.connect({ host: host === "localhost" ? "127.0.0.1" : host, port: 443, servername: host, rejectUnauthorized: !insecure }, () => {
      const c = s.getPeerCertificate();
      resolve({ authorized: s.authorized, issuer: c.issuer?.CN ?? c.issuer?.O, validTo: c.valid_to, protocol: s.getProtocol() });
      s.end();
    });
    s.on("error", reject);
  });
  check("TLS certificate", insecure ? true : cert.authorized, `${cert.protocol}, issuer ${cert.issuer}, valid to ${cert.validTo}${insecure ? " (local CA — not validated)" : ""}`);

  const redirect = await fetch(`http://${host}/api/health`, { redirect: "manual" });
  check("HTTP redirects to HTTPS", [301, 302, 307, 308].includes(redirect.status) && (redirect.headers.get("location") ?? "").startsWith("https://"), `${redirect.status} → ${redirect.headers.get("location")}`);

  const h = await fetch(`${BASE}/api/health`);
  const hb = await h.json();
  check("health: db + worker ok over HTTPS", h.status === 200 && hb.db === "ok" && hb.worker === "ok", `revision ${String(hb.revision).slice(0, 7)} schema ${hb.schemaVersion}`);

  const home = await fetch(`${BASE}/`);
  const hdr = (k) => home.headers.get(k);
  check("security headers", Boolean(hdr("strict-transport-security") && hdr("x-content-type-options") === "nosniff" && hdr("x-frame-options") && hdr("referrer-policy")), ["strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy"].map((k) => `${k}=${hdr(k) ? "set" : "missing"}`).join(", "));
  check("no server banner", !hdr("server") && !hdr("x-powered-by"), `server=${hdr("server") ?? "-"} x-powered-by=${hdr("x-powered-by") ?? "-"}`);

  const api = await fetch(`${BASE}/api/auth-config`);
  check("correlation id on API responses", Boolean(api.headers.get("x-request-id")), api.headers.get("x-request-id") ?? "missing");

  for (const [path, method] of [["/api/ops/status", "GET"], ["/api/test/faults", "POST"]]) {
    const r = await fetch(`${BASE}${path}`, { method, headers: { authorization: "Bearer probe", origin: BASE } });
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
  const cfg = await fetch(`${BASE}/api/auth-config`).then((r) => r.json()).catch(() => ({}));
  check("sign-up mode is invite_only", cfg.betaMode === "invite_only", `betaMode=${cfg.betaMode}`);
  const email = `stranger-${Date.now()}@flowline-verify.test`;
  const pre = await fetch(`${BASE}/api/beta/check`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email }) });
  const preBody = await pre.json().catch(() => ({}));
  check("uninvited email is refused by the beta check", pre.status === 200 && preBody.allowed === false, `HTTP ${pre.status} allowed=${preBody.allowed}`);
  const bad = await fetch(`${BASE}/api/beta/check`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email, code: "FL-NOT-A-REAL-CODE" }) });
  const badBody = await bad.json().catch(() => ({}));
  check("an invalid beta code is refused", bad.status === 200 && badBody.allowed === false, `HTTP ${bad.status} allowed=${badBody.allowed}`);
  // That the sign-up hook creates no user row is proven server-side by tests/integration/p4-beta-access.test.ts.
} catch (e) {
  check("verification completed", false, String(e.cause?.code ?? e.message).slice(0, 200));
}
const report = { base: BASE, insecureLocal: insecure, at: new Date().toISOString(), checks, pass: checks.every((c) => c.ok) };
mkdirSync(OUT, { recursive: true });
const file = `${OUT}/verify-${host.replace(/[^a-z0-9.-]/gi, "_")}-${Date.now()}.json`;
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(report.pass ? "BETA STACK PASS" : "BETA STACK FAIL", "→", file);
process.exitCode = report.pass ? 0 : 1;
