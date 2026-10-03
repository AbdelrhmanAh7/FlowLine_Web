/** Injected I/O keeps deterministic monitor tests off real services and credentials. */
export const REQUIRED_OPS_CHECKS = ["worker", "queue", "runs", "ai", "integrations", "apiErrors", "billingWebhooks"];
const VALID_STATUSES = new Set(["ok", "warn", "fail"]);
const RESERVED = new Set(["health", "ops", "alertDelivery"]);
const KNOWN_OPS_CHECKS = new Set([...REQUIRED_OPS_CHECKS, "disk", "backups"]);

export function createMonitor({ base, token = "", hook = "", fetcher = fetch, log = console.log }) {
  const state = new Map();
  const root = base.replace(/\/+$/, "");
  async function alert(message) {
    log(`[monitor] ${new Date().toISOString()} ${message}`);
    if (!hook) return true; // stdout-only monitoring is explicit in operator configuration.
    try {
      const response = await fetcher(hook, {
        method: "POST", redirect: "error", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: `Flowline beta: ${message}` }), signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return true;
      log(`[monitor] alert delivery failed: HTTP ${response.status}`);
    } catch {
      // Transport diagnostics can contain the secret-bearing webhook URL.
      log("[monitor] alert delivery failed: transport error");
    }
    return false;
  }

  async function probe() {
    const results = Object.create(null);
    try {
      const response = await fetcher(`${root}/api/health?require=worker`, { redirect: "error", signal: AbortSignal.timeout(10_000) });
      const body = await response.json().catch(() => null);
      const healthy = response.ok && body?.db === "ok" && body?.worker === "ok";
      results.health = { status: healthy ? "ok" : "fail", detail: `HTTP ${response.status}; ${healthy ? "database and worker healthy" : "health payload unavailable or unhealthy"}` };
    } catch {
      results.health = { status: "fail", detail: "health probe unreachable" };
    }
    if (token) {
      try {
        const response = await fetcher(`${root}/api/ops/status`, {
          redirect: "error", headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000),
        });
        const body = await response.json().catch(() => null);
        const checks = body?.checks;
        const entries = checks && typeof checks === "object" && !Array.isArray(checks) ? Object.entries(checks) : [];
        const valid = (response.status === 200 || response.status === 503) && entries.length > 0
          && REQUIRED_OPS_CHECKS.every((name) => Object.hasOwn(checks, name))
          && entries.every(([name, value]) => KNOWN_OPS_CHECKS.has(name)
            && value && VALID_STATUSES.has(value.status) && typeof value.detail === "string");
        if (valid) {
          // Detail strings can include raw backup failure marker contents. External
          // alerts and --once output receive only known names/statuses/numeric values.
          for (const [name, value] of entries) results[name] = {
            status: value.status,
            detail: `${name} check reports ${value.status}${typeof value.value === "number" && Number.isFinite(value.value) ? ` (${value.value})` : ""}`,
          };
          results.ops = { status: "ok", detail: `ops status HTTP ${response.status}` };
        } else {
          results.ops = { status: "fail", detail: `ops status unusable: HTTP ${response.status}` };
        }
      } catch {
        results.ops = { status: "fail", detail: "ops status unreachable" };
      }
      // A disappearing check (e.g. backups) means blindness, never recovery.
      for (const name of state.keys()) {
        if (!RESERVED.has(name) && !Object.hasOwn(results, name)) results[name] = { status: "fail", detail: "previously monitored check is missing" };
      }
    } else {
      results.ops = { status: "warn", detail: "ops token is not configured; only health is monitored" };
    }
    return results;
  }

  async function tick() {
    const results = await probe();
    let deliveryFailed = false;
    for (const [name, result] of Object.entries(results)) {
      const previous = state.get(name) ?? { status: "ok", streak: 0, alerted: null };
      if (result.status === "ok") {
        if (previous.alerted && !await alert(`RECOVERED ${name}: ${result.detail}`)) {
          deliveryFailed = true;
          continue; // retain the recovery until a subsequent tick delivers it.
        }
        state.set(name, { status: "ok", streak: 0, alerted: null });
      } else {
        const streak = previous.status === result.status ? previous.streak + 1 : 1;
        let alerted = previous.alerted;
        if (alerted !== result.status && streak >= 2) {
          const delivered = await alert(`${result.status.toUpperCase()} ${name}: ${result.detail}`);
          if (delivered) alerted = result.status;
          deliveryFailed ||= !delivered;
        }
        state.set(name, { status: result.status, streak, alerted });
      }
    }
    if (deliveryFailed) results.alertDelivery = { status: "fail", detail: "one or more notifications could not be delivered" };
    return results;
  }
  return { probe, tick, alert };
}
