import { DESIGN_TEMPLATES } from "@/engine/design-templates";
import { LOCAL_TEMPLATES } from "@/engine/templates";
import type { FlowGraph } from "@/engine/types";
import type { Translator } from "./translate";
import { dataText } from "./workspace-text";

/**
 * Built-in template text in the UI language. The templates themselves (`src/engine`) stay English; names and step
 * labels are looked up by template id and node id (`localTemplates.<id>.nodes.<nodeId>` / `designTemplates.…`),
 * falling back to the template's own English.
 *
 * A flow created from a template copies these once, in the creator's language: after that, the flow name and step
 * labels are the user's data (editable, never re-translated), so existing flows are not rewritten.
 */

type TemplateGroup = "localTemplates" | "designTemplates";
type TemplateLike = { id: string; name: string; graph: FlowGraph };

const LOCAL_IDS = new Set(LOCAL_TEMPLATES.map((tpl) => tpl.id));
const DESIGN_IDS = new Set(DESIGN_TEMPLATES.map((tpl) => tpl.id));

function groupOf(templateId: string): TemplateGroup | null {
  return LOCAL_IDS.has(templateId) ? "localTemplates" : DESIGN_IDS.has(templateId) ? "designTemplates" : null;
}

export function templateName(t: Translator, tpl: { id: string; name: string }): string {
  const group = groupOf(tpl.id);
  return group ? dataText(t, `${group}.${tpl.id}`, "name", tpl.name) : tpl.name;
}

export function templateNodeLabel(t: Translator, templateId: string, node: { id: string; data: { label: string } }): string {
  const group = groupOf(templateId);
  return group ? dataText(t, `${group}.${templateId}.nodes`, node.id, node.data.label) : node.data.label;
}

/** A copy of the template's name and graph with the name and step labels in the translator's language. */
export function localizeTemplate(t: Translator, tpl: TemplateLike): { name: string; graph: FlowGraph } {
  const graph = structuredClone(tpl.graph);
  for (const node of graph.nodes) node.data.label = templateNodeLabel(t, tpl.id, node);
  return { name: templateName(t, tpl), graph };
}
