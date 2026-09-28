import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/ops/status/route";
import { opsStatus } from "@/server/ops";
import { closeDb } from "./helpers";

const prev = process.env.FLOWLINE_OPS_TOKEN;
afterAll(async () => {
  process.env.FLOWLINE_OPS_TOKEN = prev;
  await closeDb();
});
const TOKEN = "ops-test-token-0123456789abcdef";

describe("ops status (P4-11)", () => {
  it("doesn't exist without the right token (404), including when no token is configured", async () => {
    delete process.env.FLOWLINE_OPS_TOKEN;
    expect((await GET(new Request("http://localhost/api/ops/status", { headers: { authorization: `Bearer ${TOKEN}` } }))).status).toBe(404);
    process.env.FLOWLINE_OPS_TOKEN = TOKEN;
    expect((await GET(new Request("http://localhost/api/ops/status"))).status).toBe(404);
    expect((await GET(new Request("http://localhost/api/ops/status", { headers: { authorization: "Bearer wrong-token-0123456789abcdef" } }))).status).toBe(404);
  });

  it("reports worker, queue, runs, AI, integrations and billing webhooks with the right token", async () => {
    process.env.FLOWLINE_OPS_TOKEN = TOKEN;
    const res = await GET(new Request("http://localhost/api/ops/status", { headers: { authorization: `Bearer ${TOKEN}` } }));
    const body = await res.json();
    expect(Object.keys(body.checks)).toEqual(expect.arrayContaining(["worker", "queue", "runs", "ai", "integrations", "billingWebhooks"]));
    for (const c of Object.values(body.checks) as { status: string }[]) expect(["ok", "warn", "fail"]).toContain(c.status);
  });

  it("backup freshness: missing → fail, fresh → ok, a newer failure marker → fail", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fl-backups-"));
    expect((await opsStatus({ backupDir: dir })).checks.backups!.status).toBe("fail");
    writeFileSync(join(dir, "LAST_OK"), "backup ok x");
    expect((await opsStatus({ backupDir: dir })).checks.backups!.status).toBe("ok");
    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(join(dir, "LAST_FAILED"), "backup FAILED y");
    const s = await opsStatus({ backupDir: dir, dataDir: dir });
    expect(s.checks.backups!.status).toBe("fail");
    expect(s.checks.disk!.status).toMatch(/ok|warn|fail/);
    expect(s.status).toBe("fail");
  });
});
