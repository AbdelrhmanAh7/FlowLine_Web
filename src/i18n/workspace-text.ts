import type { Translator } from "./translate";
import type { MessageKey, Vars } from "./types";

/**
 * UI-layer text for values that arrive as data from the API (agent tools and permissions, statuses, kinds…).
 * A known value maps to its catalogue key; anything unrecognised is shown as the raw value, so nothing is hidden.
 */

/** `prefix.value` when the catalogue has it, otherwise `fallback` (default: the raw value). */
export function dataText(t: Translator, prefix: string, value: string, fallback: string = value, vars?: Vars): string {
  const key = `${prefix}.${value}`;
  if (!t.has(key)) return fallback;
  const text = t(key as MessageKey, vars);
  // t() returns the key itself when the path names a group or a plural rather than a message.
  return text === key ? fallback : text;
}

/** "knowledge search (allow), run workflow (ask)" / "البحث في المعرفة (مسموح)، …"; "no tools" when empty. */
export function agentToolSummary(t: Translator, tools: readonly { tool: string; permission: string }[]): string {
  if (tools.length === 0) return t("agents.noTools");
  return tools
    .map((x) =>
      t("agents.toolWithPermission", {
        tool: dataText(t, "agents.tool", x.tool, x.tool.replace("_", " ")),
        permission: dataText(t, "agents.permissionWord", x.permission),
      }),
    )
    .join(t("perm.listSep"));
}
