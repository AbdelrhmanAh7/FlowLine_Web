#!/usr/bin/env node
/**
 * Beta monitor (P4-11): polls /api/health and /api/ops/status every minute and alerts on changes.
 * Alerts go to FLOWLINE_ALERT_WEBHOOK_URL (Slack/Discord-compatible JSON {text}) and stdout; a check must fail twice in a
 * row before it alerts (no flapping) and recovery is announced once. Runs as the `monitor` service in the beta stack.
 *   OPS_BASE=http://web:3000 FLOWLINE_OPS_TOKEN=… node scripts/ops/monitor.mjs [--once]
 */
const BASE = (process.env.OPS_BASE ?? "http://localhost:3000").replace(/\/+$/, "");
const TOKEN = process.env.FLOWLINE_OPS_TOKEN ?? "";
const HOOK = process.env.FLOWLINE_ALERT_WEBHOOK_URL ?? "";
const INTERVAL = Number(process.env.OPS_INTERVAL_MS ?? 60_000);
const once = process.argv.includes("--once");

const state = new Map(); // check → { status, streak, alerted }
async function alert(text) {
  console.log(`[monitor] ${new Date().toISOString()} ${text}`);
  if (!HOOK) return;
  await fetch(HOOK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `Flowline beta: ${text}` }), signal: AbortSignal.timeout(10_000) }).catch((e) => console.log("[monitor] alert delivery failed:", e.message));
}

async function probe() {
  const results = {};
  try {
    const h = await fetch(`${BASE}/api/health?require=worker`, { signal: AbortSignal.timeout(10_000) });
    const body = await h.json().catch(() => ({}));
    results.health = { status: h.ok ? "ok" : "fail", detail: `HTTP ${h.status} db=${body.db} worker=${body.worker}` };
  } catch (e) {
    results.health = { status: "fail", detail: `unreachable: ${e.message}` };
  }
  if (TOKEN) {
    try {
      const r = await fetch(`${BASE}/api/ops/status`, { headers: { authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(15_000) });
      const body = await r.json();
      for (const [k, v] of Object.entries(body.checks ?? {})) results[k] = v;
    } catch (e) {
      results.ops = { status: "fail", detail: `ops status unreachable: ${e.message}` };
    }
  }
  return results;
}

async function tick() {
  const results = await probe();
  for (const [name, r] of Object.entries(results)) {
    const s = state.get(name) ?? { status: "ok", streak: 0, alerted: false };
    if (r.status === "ok") {
      if (s.alerted) await alert(`RECOVERED ${name}: ${r.detail}`);
      state.set(name, { status: "ok", streak: 0, alerted: false });
    } else {
      const streak = s.status === r.status ? s.streak + 1 : 1;
      const alerted = s.alerted || streak >= 2;
      if (!s.alerted && streak >= 2) await alert(`${r.status.toUpperCase()} ${name}: ${r.detail}`);
      state.set(name, { status: r.status, streak, alerted });
    }
  }
  if (once) console.log(JSON.stringify(results, null, 2));
}

if (once) await tick();
else {
  await alert(`monitor started for ${BASE}`);
  for (;;) {
    await tick().catch((e) => console.log("[monitor] tick failed:", e.message));
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}
