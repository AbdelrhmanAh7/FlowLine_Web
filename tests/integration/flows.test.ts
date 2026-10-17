import { afterAll, afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireFlow } from "@/server/access";
import { resetFaults, setFault } from "@/server/faults";
import { createFlow, listFlows, listVersions, saveFlow, softDeleteFlow } from "@/server/flows";
import { createWorkspace } from "@/server/workspaces";
import type { CurrentUser } from "@/server/access";
import type { FlowGraph } from "@/engine/types";
import { BLANK_GRAPH, LOCAL_TEMPLATES } from "@/engine/templates";
import { closeDb, expectHttpError, makeUser, unique } from "./helpers";

afterAll(closeDb);
afterEach(() => resetFaults());

async function setup() {
  const user = await makeUser("flow");
  const ws = await createWorkspace(user, unique("Flows"));
  return { user, ws };
}

const save = (user: CurrentUser, flowId: string, input: Parameters<typeof saveFlow>[2]) => saveFlow(user, flowId, input);

describe("createFlow", () => {
  it("creates a blank flow", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { name: unique("Blank") });
    expect(flow.graph).toEqual(BLANK_GRAPH);
    expect(flow.revision).toBe(1);
    expect(flow.templateId).toBeNull();
    expect(flow.workspaceId).toBe(ws.id);
    expect(flow.createdBy).toBe(user.id);
  });

  it("creates a flow from a local template", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier" });
    const template = LOCAL_TEMPLATES.find((t) => t.id === "lead-qualifier")!;
    expect(flow.name).toBe(template.name);
    expect(flow.templateId).toBe("lead-qualifier");
    expect((flow.graph as FlowGraph).nodes).toHaveLength(5);
    // The stored graph must be a copy, not the shared template object.
    expect(flow.graph).not.toBe(template.graph);
  });

  it("creates a template flow in the creator's language; English is exactly the template (CX4Q-01)", async () => {
    const { user, ws } = await setup();
    const template = LOCAL_TEMPLATES.find((t) => t.id === "lead-qualifier")!;
    const english = await createFlow(user, ws.id, { templateId: "lead-qualifier" }, "en");
    expect(english.name).toBe("Lead Qualifier");
    expect(english.graph).toEqual(template.graph);

    const arabic = await createFlow(user, ws.id, { templateId: "lead-qualifier" }, "ar");
    expect(arabic.name).toBe("تأهيل العملاء المحتملين");
    const nodes = (arabic.graph as FlowGraph).nodes;
    expect(nodes.find((n) => n.id === "normalise")!.data.label).toBe("توحيد بيانات العميل");
    expect(nodes.find((n) => n.id === "is-hot")!.data.label).toBe("50 موظفًا أو أكثر؟");
    // Only labels change: ids, types, config and edges are the template's.
    expect(nodes.map((n) => [n.id, n.type, n.data.config])).toEqual(template.graph.nodes.map((n) => [n.id, n.type, n.data.config]));
    expect((arabic.graph as FlowGraph).edges).toEqual(template.graph.edges);
    // An explicit name still wins, and the shared template is untouched.
    expect((await createFlow(user, ws.id, { templateId: "lead-qualifier", name: "Mine" }, "ar")).name).toBe("Mine");
    expect(template.graph.nodes[1]!.data.label).toBe("Normalise lead");
  });

  it("rejects an unknown template with 400", async () => {
    const { user, ws } = await setup();
    await expectHttpError(createFlow(user, ws.id, { templateId: "no-such-template" }), 400, "UNKNOWN_TEMPLATE");
  });

  const n8nWorkflow = {
    name: "n8n import",
    nodes: [
      { name: "Hook", type: "n8n-nodes-base.webhook", typeVersion: 1, position: [0, 0], parameters: { path: "lead" } },
      { name: "Sheet", type: "n8n-nodes-base.googleSheets", typeVersion: 1, position: [240, 0], parameters: {} },
    ],
    connections: { Hook: { main: [[{ node: "Sheet", type: "main", index: 0 }]] } },
  };

  it("creates a flow from an n8n import and stores the converted graph (#164)", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { n8n: n8nWorkflow });
    expect(flow.name).toBe("n8n import");
    expect(flow.templateId).toBeNull();
    const nodes = (flow.graph as FlowGraph).nodes;
    expect(nodes.map((n) => n.type)).toEqual(["trigger.webhook", "transform.json"]);
    // The unmapped node keeps the explicit placeholder flag validateGraph rejects.
    expect((nodes[1]!.data.config as { placeholder?: boolean }).placeholder).toBe(true);
  });

  it("rejects a create that asks for a template and an n8n import at once with 400 (#164)", async () => {
    const { user, ws } = await setup();
    await expectHttpError(createFlow(user, ws.id, { templateId: "lead-qualifier", n8n: n8nWorkflow }), 400, "MIXED_CREATE_INPUT");
    // The rejected create inserts nothing.
    expect(await listFlows(ws.id)).toHaveLength(0);
  });

  it("rejects an n8n import that is not a workflow with 400 (#164)", async () => {
    const { user, ws } = await setup();
    await expectHttpError(createFlow(user, ws.id, { n8n: { foo: "bar" } }), 400, "INVALID_N8N_JSON");
  });
});

describe("saveFlow", () => {
  it("bumps the revision on every accepted save", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier" });
    const first = await save(user, flow.id, { baseRevision: 1, name: unique("Renamed") });
    expect(first.flow.revision).toBe(2);
    const second = await save(user, flow.id, { baseRevision: 2 });
    expect(second.flow.revision).toBe(3);

    const [stored] = await db.select().from(schema.flow).where(eq(schema.flow.id, flow.id));
    expect(stored.revision).toBe(3);
    expect(stored.updatedBy).toBe(user.id);
  });

  it("rejects a stale baseRevision with 409 and the server revision in details", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier" });
    await save(user, flow.id, { baseRevision: 1 });

    const err = await expectHttpError(save(user, flow.id, { baseRevision: 1, name: unique("Stale") }), 409, "REVISION_CONFLICT");
    const details = err.details as { serverRevision: number; serverName: string };
    expect(details.serverRevision).toBe(2);
    expect(details.serverName).toBe(flow.name);
  });

  it("force:true overwrites and keeps the server copy as an 'overwrite' version", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier" });
    await save(user, flow.id, { baseRevision: 1, name: unique("Server copy") });

    const result = await save(user, flow.id, { baseRevision: 1, name: unique("Offline copy"), force: true });
    expect(result.flow.revision).toBe(3);

    const versions = await listVersions(flow.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].reason).toBe("overwrite");
    expect(versions[0].revision).toBe(2); // the overwritten server copy
    expect(versions[0].version).toBeNull(); // only publications are numbered (#204)
  });

  it("createVersion:true records a 'save' version; autosave does not", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier" });

    const autosave = await save(user, flow.id, { baseRevision: 1 });
    expect(autosave.version).toBeNull();
    expect(await listVersions(flow.id)).toHaveLength(0);

    const explicit = await save(user, flow.id, { baseRevision: 2, createVersion: true });
    expect(explicit.version?.reason).toBe("save");
    expect(explicit.version?.revision).toBe(3);

    const versions = await listVersions(flow.id);
    expect(versions).toHaveLength(1);
    // Unnumbered since #204: only a publication takes a version number.
    expect(versions[0]).toMatchObject({ version: null, revision: 3, reason: "save" });

    await save(user, flow.id, { baseRevision: 3, createVersion: true });
    expect((await listVersions(flow.id)).map(({ version, revision, reason }) => ({ version, revision, reason }))).toEqual([
      { version: null, revision: 4, reason: "save" },
      { version: null, revision: 3, reason: "save" },
    ]);
  });

  it("404s when saving a deleted flow", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, {});
    await softDeleteFlow(flow.id);
    await expectHttpError(save(user, flow.id, { baseRevision: 1 }), 404, "NOT_FOUND");
  });

  it("an injected save fault fails once with 500 and the next save succeeds", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier" });

    setFault(user.id, "save", 1);
    await expectHttpError(save(user, flow.id, { baseRevision: 1 }), 500, "INJECTED_FAULT");

    // Fault consumed: the retry goes through and the revision was not bumped by the failure.
    const retry = await save(user, flow.id, { baseRevision: 1 });
    expect(retry.flow.revision).toBe(2);
  });
});

describe("softDeleteFlow", () => {
  it("hides the flow from listFlows and requireFlow", async () => {
    const { user, ws } = await setup();
    const keep = await createFlow(user, ws.id, { name: unique("Keep") });
    const gone = await createFlow(user, ws.id, { name: unique("Gone") });

    await softDeleteFlow(gone.id);

    const listed = await listFlows(ws.id);
    expect(listed.some((f) => f.id === keep.id)).toBe(true);
    expect(listed.some((f) => f.id === gone.id)).toBe(false);

    await expectHttpError(requireFlow(user, gone.id), 404, "NOT_FOUND");
    const stillThere = await requireFlow(user, keep.id);
    expect(stillThere.flow.id).toBe(keep.id);

    // Row still exists in the DB — it's a soft delete.
    const [row] = await db.select().from(schema.flow).where(eq(schema.flow.id, gone.id));
    expect(row.deletedAt).not.toBeNull();
  });
});
