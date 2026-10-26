import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {}, schema: {} }));
import {
  templateActionIds,
  missingTemplateActions,
  availableDesignTemplates,
  heldBackDesignTemplates,
  DESIGN_TEMPLATES,
  type DesignTemplate,
} from "@/engine/design-templates";
import type { FlowGraph } from "@/engine/types";
import { getAction } from "@/integrations/registry";
import { createFlow } from "@/server/flows";
import { HttpError } from "@/server/http";
import type { CurrentUser } from "@/server/access";

const mockGraph = (actionIds: string[]): FlowGraph => ({
  nodes: [
    { id: "start", type: "trigger.manual", position: { x: 0, y: 0 }, data: { label: "Start", config: {} as never } },
    ...actionIds.map((actionId, idx) => ({
      id: `act_${idx}`,
      type: "integration.action" as const,
      position: { x: (idx + 1) * 100, y: 0 },
      data: { label: `Action ${idx}`, config: { actionId, connectionId: "", inputMapping: "{}", requireApproval: false } as never },
    })),
    { id: "end", type: "output", position: { x: 500, y: 0 }, data: { label: "End", config: { key: "out", expression: "$" } as never } },
  ],
  edges: [],
});

describe("templateActionIds and missingTemplateActions (AC4)", () => {
  it("extracts and dedupes all integration action IDs in node order", () => {
    const graph = mockGraph(["slack.post_message", "mizano.create_customer", "slack.post_message", "google_sheets.append_row"]);
    expect(templateActionIds(graph)).toEqual([
      "slack.post_message",
      "mizano.create_customer",
      "google_sheets.append_row",
    ]);
  });

  it("handles graphs with no integration actions", () => {
    const graph = mockGraph([]);
    expect(templateActionIds(graph)).toEqual([]);
  });

  it("filters out missing actions against registry (AC1, AC2)", () => {
    const graph = mockGraph(["mizano.create_quote", "slack.post_message"]);
    const partialRegistry = {
      has: (id: string) => id === "mizano.create_quote",
    };
    expect(missingTemplateActions(graph, partialRegistry)).toEqual(["slack.post_message"]);

    const noneRegistry = { has: (_id: string) => false };
    expect(missingTemplateActions(graph, noneRegistry)).toEqual(["mizano.create_quote", "slack.post_message"]);

    const fullRegistry = { has: (_id: string) => true };
    expect(missingTemplateActions(graph, fullRegistry)).toEqual([]);
  });

  it("availableDesignTemplates and heldBackDesignTemplates filter templates appropriately", () => {
    const tpl1: DesignTemplate = {
      id: "tpl-1",
      name: "Tpl 1",
      description: "Tpl 1 desc",
      category: "Sales",
      goal: "sales",
      requires: [],
      setup: [],
      graph: mockGraph(["slack.post_message"]),
    };
    const tpl2: DesignTemplate = {
      id: "tpl-2",
      name: "Tpl 2",
      description: "Tpl 2 desc",
      category: "Sales",
      goal: "sales",
      requires: [],
      setup: [],
      graph: mockGraph(["unregistered.action"]),
    };

    const registry = {
      has: (id: string) => id === "slack.post_message",
    };

    expect(availableDesignTemplates(registry, [tpl1, tpl2])).toEqual([tpl1]);
    expect(heldBackDesignTemplates(registry, [tpl1, tpl2])).toEqual([
      { template: tpl2, missing: ["unregistered.action"] },
    ]);
  });

  it("formats the missing actions validation message as specified in #341 (AC1, AC2)", async () => {
    const user: CurrentUser = { id: "user_test", email: "user@example.com", name: "User Test" };
    const testTemplateSingle: DesignTemplate = {
      id: "test-missing-action-single",
      name: "Test Single",
      description: "Test desc",
      category: "Sales",
      goal: "sales",
      requires: [],
      setup: [],
      graph: mockGraph(["slack.post_message_unregistered"]),
    };
    const testTemplateMulti: DesignTemplate = {
      id: "test-missing-action-multi",
      name: "Test Multi",
      description: "Test desc",
      category: "Sales",
      goal: "sales",
      requires: [],
      setup: [],
      graph: mockGraph(["mizano.create_quote_unregistered", "slack.post_message_unregistered"]),
    };

    DESIGN_TEMPLATES.push(testTemplateSingle, testTemplateMulti);
    try {
      try {
        await createFlow(user, "ws_test", { templateId: "test-missing-action-single" });
        expect.unreachable("expected createFlow to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        expect((err as HttpError).status).toBe(409);
        expect((err as HttpError).code).toBe("TEMPLATE_UNAVAILABLE");
        expect((err as HttpError).message).toBe(
          "That template needs app actions that aren't available yet: slack.post_message_unregistered",
        );
      }

      try {
        await createFlow(user, "ws_test", { templateId: "test-missing-action-multi" });
        expect.unreachable("expected createFlow to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        expect((err as HttpError).status).toBe(409);
        expect((err as HttpError).code).toBe("TEMPLATE_UNAVAILABLE");
        expect((err as HttpError).message).toBe(
          "That template needs app actions that aren't available yet: mizano.create_quote_unregistered, slack.post_message_unregistered",
        );
      }
    } finally {
      const idxSingle = DESIGN_TEMPLATES.findIndex((t) => t.id === "test-missing-action-single");
      if (idxSingle !== -1) DESIGN_TEMPLATES.splice(idxSingle, 1);
      const idxMulti = DESIGN_TEMPLATES.findIndex((t) => t.id === "test-missing-action-multi");
      if (idxMulti !== -1) DESIGN_TEMPLATES.splice(idxMulti, 1);
    }
  });

  it("all built-in DESIGN_TEMPLATES resolve their required actions against the provider registry (AC3)", () => {
    const registry = { has: (id: string) => getAction(id) !== undefined };
    for (const tpl of DESIGN_TEMPLATES) {
      expect(missingTemplateActions(tpl.graph, registry), `template ${tpl.id} has missing actions`).toEqual([]);
    }
  });
});
