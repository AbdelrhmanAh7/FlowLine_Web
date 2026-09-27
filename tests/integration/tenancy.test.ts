import { afterAll, describe, expect, it } from "vitest";
import { requireFlow, requireRun, requireWorkspace } from "@/server/access";
import { createFlow, listFlows } from "@/server/flows";
import { enqueueRun, listRuns } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { addMember, claimAndProcess, closeDb, expectHttpError, makeUser, unique } from "./helpers";

afterAll(closeDb);

describe("multi-tenant isolation", () => {
  it("user B cannot see user A's workspace, flow or run (404, not 403)", async () => {
    const a = await makeUser("tenant-a");
    const b = await makeUser("tenant-b");
    const wsA = await createWorkspace(a, unique("A Corp"));
    const wsB = await createWorkspace(b, unique("B Corp"));

    const flowA = await createFlow(a, wsA.id, { templateId: "lead-qualifier", name: unique("A flow") });
    const runA = await enqueueRun(a, flowA.id);

    // Non-membership is indistinguishable from non-existence.
    await expectHttpError(requireWorkspace(b, wsA.id), 404, "NOT_FOUND");
    await expectHttpError(requireFlow(b, flowA.id), 404, "NOT_FOUND");
    await expectHttpError(requireRun(b, runA.id), 404, "NOT_FOUND");
    // A non-uuid id is also a 404, never a different error.
    await expectHttpError(requireWorkspace(b, "not-a-uuid"), 404, "NOT_FOUND");

    // B's own workspace resolves fine, so the 404s above are tenancy, not breakage.
    const own = await requireWorkspace(b, wsB.id);
    expect(own.role).toBe("owner");

    // Listing scoped to B's workspace never leaks A's data.
    const flowsB = await listFlows(wsB.id);
    expect(flowsB.some((f) => f.id === flowA.id)).toBe(false);
    const runsB = await listRuns(wsB.id);
    expect(runsB.some((r) => r.id === runA.id)).toBe(false);

    // And A's listings do contain them (control).
    expect((await listFlows(wsA.id)).some((f) => f.id === flowA.id)).toBe(true);
    expect((await listRuns(wsA.id)).some((r) => r.id === runA.id)).toBe(true);

    // Drain A's queued run so later suites claim only their own runs quickly.
    await claimAndProcess(runA.id);
  });

  it("a viewer member can read but gets 403 for editor-level access", async () => {
    const owner = await makeUser("tenant-owner");
    const viewer = await makeUser("tenant-viewer");
    const ws = await createWorkspace(owner, unique("Shared Corp"));
    await addMember(ws.id, viewer.id, "viewer");

    const flow = await createFlow(owner, ws.id, { templateId: "ticket-priority", name: unique("Shared flow") });
    const run = await enqueueRun(owner, flow.id);

    const wsAccess = await requireWorkspace(viewer, ws.id);
    expect(wsAccess.role).toBe("viewer");

    const flowAccess = await requireFlow(viewer, flow.id);
    expect(flowAccess.role).toBe("viewer");
    expect(flowAccess.flow.id).toBe(flow.id);

    const runAccess = await requireRun(viewer, run.id);
    expect(runAccess.role).toBe("viewer");

    // Escalating the required role is forbidden — and it must be 403, not 404,
    // because the viewer legitimately knows the resource exists.
    await expectHttpError(requireFlow(viewer, flow.id, "editor"), 403, "FORBIDDEN");
    await expectHttpError(requireRun(viewer, run.id, "editor"), 403, "FORBIDDEN");
    await expectHttpError(requireWorkspace(viewer, ws.id, "owner"), 403, "FORBIDDEN");

    // Members of another tenant still get 404 for this workspace.
    const outsider = await makeUser("tenant-outsider");
    await expectHttpError(requireFlow(outsider, flow.id), 404, "NOT_FOUND");

    await claimAndProcess(run.id);
  });
});
