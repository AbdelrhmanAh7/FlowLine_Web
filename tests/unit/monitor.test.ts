import { describe, expect, it, vi } from "vitest";
import { createMonitor, REQUIRED_OPS_CHECKS } from "../../scripts/ops/monitor-core.mjs";

const healthy = () => Response.json({ db: "ok", worker: "ok" });
const checks = () => Object.fromEntries(REQUIRED_OPS_CHECKS.map((name) => [name, { status: "ok", detail: "healthy" }]));

describe("pilot operational monitor", () => {
  it.each([{}, { db: "down", worker: "ok" }, { db: "ok", worker: "offline" }])("rejects HTTP 200 with incomplete or unhealthy health %j", async (body) => {
    const monitor = createMonitor({ base: "http://synthetic.test", fetcher: vi.fn(async () => Response.json(body)), log: vi.fn() });
    expect((await monitor.probe()).health.status).toBe("fail");
  });
  it("accepts validated health and refuses redirects", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => healthy());
    const monitor = createMonitor({ base: "http://synthetic.test/", fetcher, log: vi.fn() });
    expect((await monitor.tick()).health.status).toBe("ok");
    expect(fetcher.mock.calls[0]).toEqual(["http://synthetic.test/api/health?require=worker", expect.objectContaining({ redirect: "error" })]);
  });
  it.each([
    { checks: {} }, { checks: [] }, { checks: { worker: { status: "ok", detail: "healthy" } } },
    { checks: { ...checks(), queue: { status: "bogus", detail: "bad" } } },
    { checks: { ...checks(), health: { status: "ok", detail: "override" } } },
    { checks: { ...checks(), queue: null } },
  ])("flags unusable ops payload %j", async (body) => {
    const fetcher = vi.fn<typeof fetch>(async (url) => String(url).includes("/api/health") ? healthy() : Response.json(body));
    const monitor = createMonitor({ base: "http://synthetic.test", token: "synthetic-token", fetcher, log: vi.fn() });
    expect((await monitor.probe()).ops.status).toBe("fail");
  });
  it("records failing checks from a valid HTTP 503 ops response", async () => {
    const body = checks(); body.queue.status = "fail";
    const fetcher = vi.fn<typeof fetch>(async (url) => String(url).includes("/api/health") ? healthy() : Response.json({ checks: body }, { status: 503 }));
    const monitor = createMonitor({ base: "http://synthetic.test", token: "synthetic-token", fetcher, log: vi.fn() });
    const result = await monitor.probe();
    expect(result.ops.status).toBe("ok"); expect(result.queue.status).toBe("fail");
    expect(fetcher.mock.calls[1]).toEqual([expect.any(String), expect.objectContaining({ redirect: "error", headers: { authorization: "Bearer synthetic-token" } })]);
  });
  it("retries failed alert delivery, sends once after success, and retries failed recovery delivery", async () => {
    let healthOk = false;
    const delivery = [500, 200, 500, 200];
    const fetcher = vi.fn<typeof fetch>(async (url) => String(url).includes("/api/health")
      ? Response.json({ db: healthOk ? "ok" : "down", worker: "ok" }, { status: healthOk ? 200 : 503 })
      : new Response(null, { status: delivery.shift() ?? 200 }));
    const log = vi.fn();
    const monitor = createMonitor({ base: "http://synthetic.test", token: "synthetic-token", hook: "http://alert.test/private", fetcher: async (url, init) => String(url).includes("/api/ops") ? Response.json({ checks: checks() }) : fetcher(url, init), log });
    await monitor.tick();
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("alert.test"))).toHaveLength(0);
    expect((await monitor.tick()).alertDelivery.status).toBe("fail");
    await monitor.tick(); await monitor.tick();
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("alert.test"))).toHaveLength(2);
    healthOk = true;
    expect((await monitor.tick()).alertDelivery.status).toBe("fail");
    await monitor.tick(); await monitor.tick();
    const alerts = fetcher.mock.calls.filter(([url]) => String(url).includes("alert.test"));
    expect(alerts).toHaveLength(4);
    expect(alerts[0][1]).toEqual(expect.objectContaining({ redirect: "error", method: "POST" }));
    expect(log.mock.calls.flat().join(" ")).not.toContain("http://alert.test/private");
  });
  it("keeps disappeared backup checks failing until they return", async () => {
    let showBackup = true;
    const log = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async (url) => String(url).includes("/api/health") ? healthy()
      : Response.json({ checks: { ...checks(), ...(showBackup ? { backups: { status: "ok", detail: "recent" } } : {}) } }));
    const monitor = createMonitor({ base: "http://synthetic.test", token: "synthetic-token", fetcher, log });
    await monitor.tick(); showBackup = false;
    expect((await monitor.tick()).backups.status).toBe("fail");
    await monitor.tick();
    expect(log.mock.calls.flat().join(" ")).toContain("FAIL backups");
    showBackup = true; await monitor.tick();
    expect(log.mock.calls.flat().join(" ")).toContain("RECOVERED backups");
  });
  it("does not expose webhook credentials from transport exceptions", async () => {
    const log = vi.fn();
    const monitor = createMonitor({ base: "http://synthetic.test", hook: "https://alert.test/private-secret", fetcher: vi.fn(async () => { throw new Error("failed https://alert.test/private-secret"); }), log });
    expect(await monitor.alert("synthetic outage")).toBe(false);
    expect(log.mock.calls.flat().join(" ")).not.toContain("private-secret");
  });
  it("does not forward arbitrary ops details or string values to external alerts or probe output", async () => {
    const canary = "synthetic-secret-from-backup-marker";
    const payload = { checks: { ...checks(), backups: { status: "fail", detail: canary, value: canary } } };
    const fetcher = vi.fn<typeof fetch>(async (url) => String(url).includes("/api/health") ? healthy()
      : String(url).includes("/api/ops") ? Response.json(payload) : new Response(null, { status: 200 }));
    const log = vi.fn();
    const monitor = createMonitor({ base: "http://synthetic.test", token: "synthetic-token", hook: "http://alert.test", fetcher, log });
    expect(JSON.stringify(await monitor.tick())).not.toContain(canary);
    expect(JSON.stringify(await monitor.tick())).not.toContain(canary);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("alert.test"))).toHaveLength(1);
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain(canary);
    expect(JSON.stringify(log.mock.calls)).not.toContain(canary);
  });
  it("announces an escalation from a delivered warning to a sustained failure", async () => {
    let status = "warn";
    const log = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async (url) => String(url).includes("/api/health") ? healthy()
      : Response.json({ checks: { ...checks(), queue: { status, detail: "synthetic" } } }));
    const monitor = createMonitor({ base: "http://synthetic.test", token: "synthetic-token", fetcher, log });
    await monitor.tick(); await monitor.tick();
    status = "fail"; await monitor.tick(); await monitor.tick(); await monitor.tick();
    expect(log.mock.calls.filter(([text]) => text.includes("WARN queue"))).toHaveLength(1);
    expect(log.mock.calls.filter(([text]) => text.includes("FAIL queue"))).toHaveLength(1);
  });
  it("discloses health-only coverage when the ops token is not configured", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => healthy());
    const monitor = createMonitor({ base: "http://synthetic.test", fetcher, log: vi.fn() });
    const result = await monitor.probe();
    expect(result.health.status).toBe("ok");
    expect(result.ops).toEqual({ status: "warn", detail: "ops token is not configured; only health is monitored" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
