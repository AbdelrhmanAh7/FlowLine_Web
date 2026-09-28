import { getNodeDefinition, NODE_DEFINITIONS } from "@/engine/nodes";
import { UNSTABLE_INPUT_MESSAGE } from "@/engine/validate";
import { CAPABILITIES, type Capability, type Role } from "@/lib/permissions";
import type { Translator } from "./translate";
import type { MessageKey, Vars } from "./types";

/**
 * UI-layer translations for text that originates in the shared engine (`src/engine`, also used by the worker).
 * The engine stays language-neutral English; here node types, validation codes and connection rules are mapped to
 * catalogue keys. Anything not recognised falls back to the engine's own English text, so nothing is ever hidden.
 */

type NodeField = "title" | "subtitle" | "description";

/** Catalogue key for a node type ("trigger.manual" → "trigger_manual"; dots would split the key path). */
const nodeKey = (type: string) => type.replace(/\./g, "_");

function optional(t: Translator, key: string, fallback: string, vars?: Vars): string {
  return t.has(key) ? t(key as MessageKey, vars) : fallback;
}

export function nodeText(t: Translator, type: string, field: NodeField): string {
  const def = getNodeDefinition(type);
  return optional(t, `nodes.${nodeKey(type)}.${field}`, def?.[field] ?? type);
}

export const nodeTitle = (t: Translator, type: string) => nodeText(t, type, "title");

export function nodeCategoryLabel(t: Translator, category: string): string {
  return optional(t, `nodeCategory.${category}`, category);
}

/** Badge label for a run/step status ("Success", "Needs approval"…). */
export function runLabel(t: Translator, status: string): string {
  return optional(t, `runStatus.${status}`, status);
}

/** A status as a plain word inside a sentence or a technical row (English keeps the raw status). */
export function statusWord(t: Translator, status: string): string {
  return optional(t, `statusWord.${status}`, status);
}

/* ───────── Permissions ───────── */

/** Translated twin of `denyReason` in `src/lib/permissions.ts` (identical English output). */
export function denyReasonText(t: Translator, role: Role | null | undefined, capability: Capability): string {
  const allowed = CAPABILITIES[capability] as readonly Role[];
  const plural = allowed.map((r) => t(`perm.rolesPlural.${r}`));
  const who = plural.length === 1 ? plural[0]! : `${plural.slice(0, -1).join(t("perm.listSep"))}${t("perm.and")}${plural.at(-1)}`;
  return role ? t("perm.denyWithRole", { who, role: t(`perm.roleWithArticle.${role}`) }) : t("perm.deny", { who });
}

/* ───────── Connection rules (engine `checkConnection`) ───────── */

const TITLE_TO_TYPE = new Map(Object.values(NODE_DEFINITIONS).map((d) => [d.title, d.type]));

const CONNECTION_RULES: [RegExp, (m: RegExpExecArray, t: Translator) => string][] = [
  [/^A node can't connect to itself$/, (_, t) => t("connection.self")],
  [/^Both ends must be nodes on the canvas$/, (_, t) => t("connection.bothEnds")],
  [/^Unknown node type$/, (_, t) => t("connection.unknownType")],
  [/^(.+) nodes have no outputs$/, (m, t) => t("connection.noOutputs", { title: titleOf(t, m[1]!) })],
  [/^(.+) nodes can't receive input$/, (m, t) => t("connection.noInputs", { title: titleOf(t, m[1]!) })],
  [/^Unknown output "(.*)"$/, (m, t) => t("connection.unknownOutput", { handle: m[1]! })],
  [/^(.+) already has an input — add a Merge node to join branches$/, (m, t) => t("connection.hasInput", { label: m[1]! })],
  [/^(.+) accepts at most (\d+) inputs$/, (m, t) => t("connection.maxInputs", { label: m[1]!, max: m[2]! })],
  [/^These nodes are already connected$/, (_, t) => t("connection.connected")],
  [/^That connection would create a loop — use a Loop node for repetition$/, (_, t) => t("connection.loop")],
];

function titleOf(t: Translator, engineTitle: string): string {
  const type = TITLE_TO_TYPE.get(engineTitle);
  return type ? nodeTitle(t, type) : engineTitle;
}

/** Translates a refusal reason from `checkConnection`; unknown text is returned unchanged. */
export function connectionReason(t: Translator, reason: string): string {
  for (const [re, fmt] of CONNECTION_RULES) {
    const m = re.exec(reason);
    if (m) return fmt(m, t);
  }
  return reason;
}

/* ───────── Validation issues (engine `validateGraph`) ───────── */

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const FIELD_NAMES: Record<string, string> = {
  expression: "expression",
  value: "value",
  predicate: "predicate",
  source: "source",
  key: "key",
  items: "items",
  input: "input",
  URL: "URL",
  headers: "headers",
  body: "body",
  "input mapping": "inputMapping",
};
const FIELD_RE = `(${Object.keys(FIELD_NAMES).map(esc).join("|")}|field "[^"]*")`;

function fieldName(t: Translator, raw: string): string {
  const named = /^field "(.*)"$/.exec(raw);
  if (named) return t("issues.field.named", { key: named[1]! });
  const k = FIELD_NAMES[raw];
  return k ? t(`issues.field.${k}` as MessageKey) : raw;
}

type Detail = [RegExp, (m: RegExpExecArray, t: Translator) => string];
const fixed = (text: string, key: MessageKey): Detail => [new RegExp(`^${esc(text)}$`), (_, t) => t(key)];

/** The part after "<label>: " for config issues, by message shape (codes like INVALID_CONFIG cover many shapes). */
const DETAILS: Detail[] = [
  fixed("sample payload is not valid JSON", "issues.detail.INVALID_JSON"),
  [/^Unknown time zone "(.*)"$/, (m, t) => t("issues.detail.cronTimezone", { tz: m[1]! })],
  fixed("Use a 5-field cron expression (minute hour day month weekday)", "issues.detail.cronFields"),
  fixed("Schedules can run at most every 5 minutes", "issues.detail.cronTooOften"),
  [/^Invalid cron: (.*)$/s, (m, t) => t("issues.detail.cronInvalid", { error: m[1]! })],
  fixed("choose a missed-run policy", "issues.detail.missedPolicy"),
  [new RegExp(`^${FIELD_RE} is empty$`), (m, t) => t("issues.detail.EMPTY_EXPRESSION", { field: fieldName(t, m[1]!) })],
  fixed("output key must be letters, digits or _ (max 64)", "issues.detail.INVALID_OUTPUT_KEY"),
  [/^"(.*)" is reserved — choose another output key$/, (m, t) => t("issues.detail.RESERVED_OUTPUT_KEY", { key: m[1]! })],
  fixed("add at least one field", "issues.detail.EMPTY_MAPPING"),
  fixed("at most 50 fields", "issues.detail.TOO_MANY_FIELDS"),
  [/^field name "(.*)" is not allowed$/, (m, t) => t("issues.detail.INVALID_FIELD", { key: m[1]! })],
  [/^field "(.*)" is mapped twice$/, (m, t) => t("issues.detail.DUPLICATE_FIELD", { key: m[1]! })],
  fixed("choose a merge mode", "issues.detail.mergeMode"),
  fixed("choose parse or build", "issues.detail.csvMode"),
  fixed("delimiter must be one character", "issues.detail.delimiter"),
  fixed("choose where the file comes from", "issues.detail.fileFrom"),
  fixed("choose an uploaded file", "issues.detail.MISSING_FILE"),
  fixed("choose how to read the file", "issues.detail.fileAs"),
  fixed("choose get or set", "issues.detail.storeOp"),
  fixed("namespace must be 1–40 letters, digits, _ . -", "issues.detail.namespace"),
  fixed("choose the subflow to run per item", "issues.detail.subflowPerItem"),
  [/^max items must be 1–(\d+)$/, (m, t) => t("issues.detail.UNBOUNDED_LOOP", { max: m[1]! })],
  fixed("pin a published subflow version", "issues.detail.pinVersion"),
  fixed("choose the subflow", "issues.detail.subflow"),
  fixed("choose an HTTP method", "issues.detail.httpMethod"),
  fixed("timeout must be 1–60 seconds", "issues.detail.httpTimeout"),
  fixed("instructions are empty", "issues.detail.instructionsEmpty"),
  fixed("instructions are longer than 4000 characters", "issues.detail.instructionsLong"),
  fixed('the output schema must be a JSON Schema with type "object"', "issues.detail.schemaType"),
  fixed("the output schema is not valid JSON", "issues.detail.schemaJson"),
  fixed("give 2–20 comma-separated labels", "issues.detail.labels"),
  fixed("max tokens must be 16–4000", "issues.detail.maxTokens"),
  fixed("code is empty", "issues.detail.codeEmpty"),
  fixed("code is longer than 20,000 characters", "issues.detail.codeLong"),
  fixed("timeout must be 0.5–30 seconds", "issues.detail.codeTimeout"),
  fixed("choose an app action", "issues.detail.MISSING_ACTION"),
  fixed("choose a connection", "issues.detail.MISSING_CONNECTION"),
  fixed(UNSTABLE_INPUT_MESSAGE, "issues.detail.APPROVAL_UNSTABLE_INPUT"),
  // Last: "<field>: <parser error>" (the parser's own message stays as-is).
  [new RegExp(`^${FIELD_RE}: (.*)$`, "s"), (m, t) => t("issues.detail.INVALID_EXPRESSION", { field: fieldName(t, m[1]!), error: m[2]! })],
];

/** Validates a schedule's cron text shown directly under the field (engine `checkCron`). */
export function detailText(t: Translator, detail: string): string {
  for (const [re, fmt] of DETAILS) {
    const m = re.exec(detail);
    if (m) return fmt(m, t);
  }
  return detail;
}

/** Whole-message shapes (graph-level codes). */
const WHOLE: Record<string, Detail> = {
  EMPTY_FLOW: fixed("Add a trigger to start your flow", "issues.EMPTY_FLOW"),
  TOO_MANY_NODES: [/^Flows are limited to (\d+) nodes$/, (m, t) => t("issues.TOO_MANY_NODES", { max: m[1]! })],
  TOO_MANY_EDGES: [/^Flows are limited to (\d+) connections$/, (m, t) => t("issues.TOO_MANY_EDGES", { max: m[1]! })],
  DUPLICATE_NODE_ID: [/^Duplicate node id (.+)$/, (m, t) => t("issues.DUPLICATE_NODE_ID", { id: m[1]! })],
  UNKNOWN_NODE: [/^Unknown node type (.+)$/, (m, t) => t("issues.UNKNOWN_NODE", { type: m[1]! })],
  NO_TRIGGER: fixed("Add a trigger — every flow starts with one", "issues.NO_TRIGGER"),
  MULTIPLE_TRIGGERS: fixed("Only one trigger per flow is supported", "issues.MULTIPLE_TRIGGERS"),
  NO_STEPS: fixed("Add at least one step after the trigger", "issues.NO_STEPS"),
  DUPLICATE_OUTPUT_KEY: [/^(.+): output key "(.*)" is used by (\d+) Output nodes$/s, (m, t) => t("issues.DUPLICATE_OUTPUT_KEY", { label: m[1]!, key: m[2]!, count: m[3]! })],
  UNCONNECTED_INPUT: [/^(.+) isn't connected to anything upstream$/s, (m, t) => t("issues.UNCONNECTED_INPUT", { label: m[1]! })],
  MERGE_NEEDS_INPUTS: [/^(.+): connect at least two branches to merge$/s, (m, t) => t("issues.MERGE_NEEDS_INPUTS", { label: m[1]! })],
  SETUP_REQUIRED: [/^(.+): finish setup — replace (REPLACE_WITH_[A-Z0-9_]+)$/s, (m, t) => t("issues.SETUP_REQUIRED", { label: m[1]!, placeholder: m[2]! })],
  UNKNOWN_REFERENCE: [/^(.+): \$steps\.(\S+) doesn't exist$/s, (m, t) => t("issues.UNKNOWN_REFERENCE", { label: m[1]!, ref: m[2]! })],
  REFERENCE_NOT_UPSTREAM: [
    /^(.+): \$steps\.(\S+) \((.*)\) doesn't run before this step$/s,
    (m, t) => t("issues.REFERENCE_NOT_UPSTREAM", { label: m[1]!, ref: m[2]!, refLabel: m[3]! }),
  ],
};

/**
 * A validation issue in the UI language, by code (with the engine's English message as the fallback).
 * `label` is the node's label when known — it lets "<label>: <detail>" split exactly even if the label contains ": ".
 */
export function issueMessage(t: Translator, issue: { code: string; message: string }, label?: string): string {
  const { code, message } = issue;
  if (code === "INVALID_EDGE") return connectionReason(t, message);
  const whole = WHOLE[code];
  if (whole) {
    const m = whole[0].exec(message);
    return m ? whole[1](m, t) : message;
  }
  // Config issues: "<label>: <detail>".
  if (label !== undefined && message.startsWith(`${label}: `)) {
    const detail = message.slice(label.length + 2);
    const out = detailText(t, detail);
    return out === detail ? message : t("issues.withLabel", { label, detail: out });
  }
  for (let i = message.indexOf(": "); i !== -1; i = message.indexOf(": ", i + 1)) {
    const detail = message.slice(i + 2);
    const out = detailText(t, detail);
    if (out !== detail) return t("issues.withLabel", { label: message.slice(0, i), detail: out });
  }
  return message;
}

/** The server's "Not previewed: …" reasons for a Copilot proposal. */
export function notPreviewedReason(t: Translator, reason: string): string {
  let m = /^Not previewed: "(.*)" \(([^)]*)\) runs outside Flowline — test it in the builder after approving\.$/s.exec(reason);
  if (m) return t("copilot.notPreviewed.outside", { label: m[1]!, type: m[2]! });
  if (reason === "Not previewed: an expression uses pattern matching — run it in the builder after approving.") return t("copilot.notPreviewed.pattern");
  if (reason === "Not previewed: the trigger's sample payload isn't valid JSON.") return t("copilot.notPreviewed.badJson");
  m = /^Not previewed: (.*)$/s.exec(reason);
  if (m) return t("copilot.notPreviewed.generic", { reason: m[1]! });
  return reason;
}

/**
 * A step/run error as shown to the user: codes with a catalogue text (`runs.errorText.<CODE>`, e.g. a platform outage)
 * are shown translated; everything else keeps the stored message (provider/engine text, see engine-text notes).
 */
export function stepErrorText(t: Translator, error: { code?: string | null; message?: string | null } | null | undefined): string {
  if (!error) return "";
  const key = `runs.errorText.${error.code ?? ""}`;
  return error.code && t.has(key) ? t(key as MessageKey) : (error.message ?? "");
}
