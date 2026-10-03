#!/usr/bin/env node
/** Poll health/ops; alert after two failing probes and announce recovery.
 * Configure FLOWLINE_ALERT_WEBHOOK_URL for external notification; otherwise stdout only.
 */
import { createMonitor } from "./monitor-core.mjs";

const BASE = process.env.OPS_BASE ?? "http://localhost:3000";
const INTERVAL = Number(process.env.OPS_INTERVAL_MS ?? 60_000);
if (!Number.isFinite(INTERVAL) || INTERVAL < 1000) throw new Error("OPS_INTERVAL_MS must be at least 1000");
const monitor = createMonitor({ base: BASE, token: process.env.FLOWLINE_OPS_TOKEN, hook: process.env.FLOWLINE_ALERT_WEBHOOK_URL });

if (process.argv.includes("--once")) {
  const results = await monitor.tick();
  console.log(JSON.stringify(results, null, 2));
  if (Object.values(results).some((result) => result.status === "fail")) process.exitCode = 1;
} else {
  await monitor.alert("monitor started");
  for (;;) {
    await monitor.tick().catch(() => console.log("[monitor] tick failed"));
    await new Promise((resolve) => setTimeout(resolve, INTERVAL));
  }
}
