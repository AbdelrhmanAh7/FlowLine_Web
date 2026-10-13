import { afterAll, describe, expect, it } from "vitest";
import { createFlow, listFlows, saveFlow } from "@/server/flows";
import { publishFlow } from "@/server/publish";
import { enqueueRun } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { claimAndProcess, closeDb, makeUser, unique } from "../integration/helpers";

afterAll(closeDb);

/**
 * Regression test for #204: publishedVersion must only change on publish, never on runs or revisions.
 * The fixture publishes once, runs twice, and saves once, so the list and dashboard must return publishedVersion 1.
 */
describe("publishedVersion only increments on publish (#204)", () => {
  it("publish once, run twice, save once -> publishedVersion is 1", async () => {
    const user = await makeUser("pub-version");
    const ws = await createWorkspace(user, unique("PubVersion"));
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier", name: unique("PubVersionFlow") });

    // Run twice (manual runs create "run" snapshots with version NULL)
    const r1 = await enqueueRun(user, flow.id);
    const r2 = await enqueueRun(user, flow.id);
    await claimAndProcess(r1.id);
    await claimAndProcess(r2.id);

    // Explicit save (⌘S) creates a "save" snapshot with version NULL
    await saveFlow(user, flow.id, { baseRevision: flow.revision, createVersion: true });

    // Publish once -> should get version 1
    const published = await publishFlow(user, flow.id);
    expect(published.version).toBe(1);

    // Flow list should report publishedVersion 1
    const rows = await listFlows(ws.id);
    const mine = rows.find((r) => r.id === flow.id)!;
    expect(mine.publishedVersion).toBe(1);
  });
});