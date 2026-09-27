import { afterAll, describe, expect, it } from "vitest";
import { eq, asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { createFlow } from "@/server/flows";
import { enqueueRun } from "@/server/runs";
import { createWorkspace, listMembers, listWorkspaces, slugify, updateWorkspace, workspaceOverview } from "@/server/workspaces";
import { claimAndProcess, closeDb, expectHttpError, freshRun, makeUser, unique } from "./helpers";

afterAll(closeDb);

describe("slugify", () => {
  it("normalises names into url-safe slugs", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
    // Note: accents are not folded — "è" decomposes (NFKD) to "e" + a combining
    // mark, and the combining mark is replaced like any other separator.
    expect(slugify("  Crème Brûlée — Démo  ")).toBe("creme-brulee-demo");
    expect(slugify("!!!")).toBe("workspace");
    expect(slugify("x".repeat(100)).length).toBeLessThanOrEqual(32);
  });
});

describe("createWorkspace", () => {
  it("creates the workspace with an owner membership and updates user settings", async () => {
    const user = await makeUser("ws-owner");
    const name = unique("Acme");
    const ws = await createWorkspace(user, `  ${name}  `);

    expect(ws.name).toBe(name); // trimmed
    expect(ws.slug).toBe(slugify(name));
    expect(ws.createdBy).toBe(user.id);

    const members = await listMembers(ws.id);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: user.id, role: "owner", email: user.email });

    const listed = await listWorkspaces(user);
    expect(listed.some((w) => w.id === ws.id && w.role === "owner")).toBe(true);

    const [settings] = await db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, user.id));
    expect(settings?.lastWorkspaceId).toBe(ws.id);
  });

  it("suffixes the slug when it collides", async () => {
    const user = await makeUser("ws-slug");
    const name = unique("Collide");
    const first = await createWorkspace(user, name);
    const second = await createWorkspace(user, name);
    expect(first.slug).toBe(slugify(name));
    expect(second.slug).toBe(`${slugify(name)}-2`);
  });

  it("rejects invalid names with 400", async () => {
    const user = await makeUser("ws-invalid");
    await expectHttpError(createWorkspace(user, "a"), 400, "VALIDATION");
    await expectHttpError(createWorkspace(user, "   "), 400, "VALIDATION");
    await expectHttpError(createWorkspace(user, "x".repeat(61)), 400, "VALIDATION");
  });
});

describe("updateWorkspace", () => {
  it("renames and validates input", async () => {
    const user = await makeUser("ws-update");
    const ws = await createWorkspace(user, unique("Before"));
    const renamed = unique("After");
    const updated = await updateWorkspace(ws.id, { name: renamed, timezone: "Europe/Berlin" });
    expect(updated.name).toBe(renamed);
    expect(updated.timezone).toBe("Europe/Berlin");

    await expectHttpError(updateWorkspace(ws.id, { name: "a" }), 400, "VALIDATION");
    await expectHttpError(updateWorkspace(ws.id, { timezone: "Not/AZone" }), 400, "VALIDATION");
  });
});

describe("workspaceOverview", () => {
  it("reports zeros for a fresh workspace", async () => {
    const user = await makeUser("ws-fresh");
    const ws = await createWorkspace(user, unique("Fresh"));
    const overview = await workspaceOverview(ws.id);
    expect(overview.flows).toBe(0);
    expect(overview.runs24h).toBe(0);
    expect(overview.failed24h).toBe(0);
    expect(overview.activeRuns).toBe(0);
    expect(overview.flowsRun24h).toBe(0);
    expect(overview.successRate24h).toBeNull();
    expect(overview.recent).toEqual([]);
  });

  it("reflects flows and runs once the workspace has run", async () => {
    const user = await makeUser("ws-active");
    const ws = await createWorkspace(user, unique("Active"));
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier", name: unique("Overview flow") });
    const run = await enqueueRun(user, flow.id);
    await claimAndProcess(run.id);
    expect((await freshRun(run.id)).status).toBe("succeeded");

    const overview = await workspaceOverview(ws.id);
    expect(overview.flows).toBe(1);
    expect(overview.runs24h).toBe(1);
    expect(overview.flowsRun24h).toBe(1);
    expect(overview.failed24h).toBe(0);
    expect(overview.activeRuns).toBe(0);
    expect(overview.successRate24h).toBe(1);
    expect(overview.recent).toHaveLength(1);
    expect(overview.recent[0]).toMatchObject({ id: run.id, number: 1, status: "succeeded", flowName: flow.name });

    // Steps counted from real run_step rows: 5 steps, 1 skipped, 4 done.
    expect(overview.recent[0].steps).toBe(4);
    expect(overview.recent[0].stepsDone).toBe(4);

    const steps = await db.select().from(schema.runStep).where(eq(schema.runStep.runId, run.id)).orderBy(asc(schema.runStep.position));
    expect(steps.map((s) => s.status)).toEqual(["succeeded", "succeeded", "succeeded", "succeeded", "skipped"]);
  });
});
