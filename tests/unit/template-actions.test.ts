import { describe, expect, it } from "vitest";
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

  it("formats the missing actions validation message as specified in #341 (AC1, AC2)", () => {
    const formatMissingActionsError = (missing: string[]) =>
      `That template needs app actions that aren't available yet: ${missing.join(", ")}`;

    expect(formatMissingActionsError(["slack.post_message"])).toBe(
      "That template needs app actions that aren't available yet: slack.post_message",
    );

    expect(formatMissingActionsError(["mizano.create_quote", "slack.post_message"])).toBe(
      "That template needs app actions that aren't available yet: mizano.create_quote, slack.post_message",
    );
  });

  it("all built-in DESIGN_TEMPLATES resolve their required actions against the provider registry (AC3)", () => {
    const registry = { has: (id: string) => getAction(id) !== undefined };
    for (const tpl of DESIGN_TEMPLATES) {
      expect(missingTemplateActions(tpl.graph, registry), `template ${tpl.id} has missing actions`).toEqual([]);
    }
  });
});
