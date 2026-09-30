import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { executeGraph, sampleInputFor } from "@/engine/execute";
import { LOCAL_SCENARIOS } from "@/engine/local-scenarios";
import type { FlowGraph } from "@/engine/types";
import { createFlow, saveFlow } from "@/server/flows";
import { enqueueRun } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { claimAndProcess, closeDb, freshRun, makeUser, unique } from "./helpers";

afterAll(closeDb);

describe("local scenarios create independent localized flows and persist worker results", () => {
  for (const template of LOCAL_SCENARIOS) {
    it(template.id, async () => {
      const user = await makeUser("scenario");
      const workspace = await createWorkspace(user, unique("Scenarios"));
      const flow = await createFlow(user, workspace.id, { templateId: template.id }, "ar");
      const second = await createFlow(user, workspace.id, { templateId: template.id }, "en");
      expect((flow.graph as FlowGraph).nodes.every((node) => /[؀-ۿ]/.test(node.data.label))).toBe(true);
      const expected = await executeGraph(template.graph, sampleInputFor(template.graph));
      expect(expected.status).toBe("succeeded");
      const run = await enqueueRun(user, flow.id);
      await claimAndProcess(run.id);
      const persisted = await freshRun(run.id);
      expect(persisted.status).toBe("succeeded");
      expect(persisted.output).toEqual(expected.output);
      const steps = await db.select().from(schema.runStep).where(eq(schema.runStep.runId, run.id));
      expect(steps).toHaveLength(template.graph.nodes.length);
      expect(steps.some((step) => step.nodeType === "output" && step.status === "succeeded")).toBe(true);
      const edited = structuredClone(flow.graph as FlowGraph);
      edited.nodes[0]!.data.label = "Edited sample";
      await saveFlow(user, flow.id, { baseRevision: 1, graph: edited });
      const [other] = await db.select().from(schema.flow).where(eq(schema.flow.id, second.id));
      expect((other!.graph as FlowGraph).nodes[0]!.data.label).toBe(template.graph.nodes[0]!.data.label);
      expect(template.graph.nodes[0]!.data.label).not.toBe("Edited sample");
    });
  }
});
