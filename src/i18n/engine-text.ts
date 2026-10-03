import { getNodeDefinition, NODE_DEFINITIONS } from "@/engine/nodes";
import { UNSTABLE_INPUT_MESSAGE } from "@/engine/validate";
import { CAPABILITIES, type Capability, type Role } from "@/lib/permissions";
import { actionTitleById } from "./integration-text";
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
  fixed("the AI model choice is invalid; pick a model again", "issues.detail.aiRoute"),
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

/* ───────── Run and step messages ───────── */

/**
 * The worker, the engine and the AI hub store their messages as English text next to a stable `code`
 * (`{ code: "AI_AUTH_FAILED", message: "OpenAI rejected the API key (401). …" }`), and those rows stay in the database
 * as written. The UI shows them in the reader's language: the code picks the sentence, and the data inside the stored
 * message (provider, HTTP status, connection label, action title…) is read back out of it and passed to the catalogue
 * text as variables, so no real cause is dropped. English output is unchanged: each `runs.errorShape` English text is the
 * stored text with placeholders (pinned by tests/unit/run-messages.test.ts against the real emitters).
 *
 * What is not recognised (provider-supplied error text, expression errors, older stored wording) keeps the stored message.
 */

/** What the caller knows about a step beyond its stored error. */
export interface RunMessageContext {
  /** A reviewer-authored note is user data, never generated error wording. */
  userNote?: boolean;
  /** The integration action (`provider.action`) the step runs, from the run's approval record: lets its title be translated. */
  actionId?: string | null;
  /** The node's label: the last-resort name of an approval wait whose message can't be parsed. */
  nodeLabel?: string | null;
}

type Shape = readonly [code: string, re: RegExp, key: MessageKey, vars?: (m: RegExpExecArray, t: Translator, ctx: RunMessageContext) => Vars];

/**
 * The integration action a step waits on or ran, from the run's approval records (a pending one first). Run lists and
 * the dock don't carry it on the step, and it lets a generated message name the action in the UI language.
 */
export function approvalActionId(
  approvals: readonly { id?: string; nodeId: string; actionId: string; status: string }[] | undefined,
  nodeId: string | null | undefined,
  approvalId?: string | null,
): string | null {
  if (!nodeId) return null;
  const forNode = (approvals ?? []).filter((a) => a.nodeId === nodeId);
  // Exact: the step records the id of the approval it waits on or ran under, so one node with several approvals
  // (a loop, a retried or superseded one) can't name the wrong action. Only the approval's stored action id is used.
  if (approvalId) return forNode.find((a) => a.id === approvalId)?.actionId ?? null;
  const pending = forNode.filter((a) => a.status === "pending");
  const actions = new Set((pending.length ? pending : forNode).map((a) => a.actionId));
  return actions.size === 1 ? [...actions][0]! : null;
}

/** The approval id a step recorded in its meta (`meta.approvalId`), or null. */
export function stepApprovalId(step: { meta?: Record<string, unknown> | null } | null | undefined): string | null {
  const id = step?.meta?.approvalId;
  return typeof id === "string" && id ? id : null;
}

/** An action's title in the UI language when the action is known by id; otherwise the English title inside the stored message. */
function actionName(t: Translator, ctx: RunMessageContext, stored: string): string {
  return (ctx.actionId ? actionTitleById(t, ctx.actionId) : null) ?? stored;
}

/** Fixed reasons a connection needs reconnecting (`STATUS_REASONS` in src/server/connections.ts), by their stored English text. */
export const CONNECTION_REASONS: Record<string, MessageKey> = {
  "The access expired and can't be refreshed — reconnect it": "runs.errorShape.connReason.refresh_unavailable",
  "The provider refused to refresh the access — reconnect it": "runs.errorShape.connReason.refresh_refused",
  "Authorized before Flowline recorded its OAuth app — reconnect it": "runs.errorShape.connReason.oauth_app_unknown",
  "The OAuth app changed — reconnect it": "runs.errorShape.connReason.oauth_app_changed",
  "The OAuth app was revoked by an administrator — reconnect it": "runs.errorShape.connReason.oauth_app_revoked",
  "The workspace OAuth app was removed — reconnect it": "runs.errorShape.connReason.oauth_app_deleted",
};

/** A reason inside "needs to be reconnected (…)": the known fixed ones are translated, anything else (a provider's own status text) stays. */
const reasonText = (t: Translator, reason: string) => (CONNECTION_REASONS[reason] ? t(CONNECTION_REASONS[reason]) : reason);

/** " [invalid_api_key]" after an HTTP status: the provider's documented error id, shown as data ("" when absent). */
const withCode = (m: RegExpExecArray, i: number) => m[i] ?? "";

const SHAPES: readonly Shape[] = [
  /* Approvals and reviews (worker/handlers.ts) */
  ["APPROVAL_REQUIRED", /^Waiting for approval to run (.+)$/s, "runs.errorShape.approvalWait", (m, t, ctx) => ({ title: actionName(t, ctx, m[1]!) })],
  ["APPROVAL_REJECTED", /^(.+?) was rejected: (.*)$/s, "runs.errorShape.approvalRejectedNote", (m, t, ctx) => ({ title: actionName(t, ctx, m[1]!), note: m[2]! })],
  ["APPROVAL_REJECTED", /^(.+) was rejected$/s, "runs.errorShape.approvalRejected", (m, t, ctx) => ({ title: actionName(t, ctx, m[1]!) })],
  ["OUTCOME_UNKNOWN", /^(?:No response|Unconfirmed outcome) from (.+?) — the request may have been applied\. Mark it done, retry, or fail\.$/, "runs.errorShape.outcomeHttp", (m) => ({ host: m[1]! })],
  [
    "OUTCOME_UNKNOWN",
    /^(.+?) may or may not have been applied by (.+?) \((?:lost response|unconfirmed outcome)\)\. Check it and choose: mark done, retry, or fail\.$/,
    "runs.errorShape.outcomeAction",
    (m, t, ctx) => ({ title: actionName(t, ctx, m[1]!), provider: m[2]! }),
  ],
  ["OUTCOME_UNKNOWN", /^"(.+)" was interrupted and may have partly run steps with external effects\. Check, then mark done, retry, or fail\.$/s, "runs.errorShape.outcomeSubflow", (m) => ({ name: m[1]! })],
  ["OUTCOME_UNKNOWN", /^The request's outcome was unknown and a reviewer failed the step$/, "runs.errorShape.outcomeFailedHttp"],
  ["OUTCOME_UNKNOWN", /^"(.+)" was interrupted and a reviewer failed the step$/s, "runs.errorShape.outcomeFailedSubflow", (m) => ({ name: m[1]! })],
  ["OUTCOME_UNKNOWN", /^(.+?) outcome was unknown and a reviewer failed the step$/, "runs.errorShape.outcomeFailedAction", (m, t, ctx) => ({ title: actionName(t, ctx, m[1]!) })],
  ["CANCELLED_IN_FLIGHT", /^Cancelled while (.+?) was in flight — it may have been applied$/, "runs.errorShape.cancelledInFlight", (m, t, ctx) => ({ title: actionName(t, ctx, m[1]!) })],

  /* AI hub (src/ai/hub/protocols/shared.ts `mapProviderError`, transport.ts, routing.ts, execute.ts, credentials.ts) */
  ["AI_AUTH_FAILED", /^(.+?) rejected the API key \((\d+)\)\. Rotate the key in Settings → AI Providers\.$/, "runs.errorShape.aiAuthFailed", (m) => ({ provider: m[1]!, status: m[2]! })],
  ["AI_RATE_LIMITED", /^(.+?) rate-limited the request \((\d+)\)$/, "runs.errorShape.aiRateLimited", (m) => ({ provider: m[1]!, status: m[2]! })],
  ["AI_TIMEOUT", /^(.+?) timed out \((\d+)\)$/, "runs.errorShape.aiTimedOut", (m) => ({ provider: m[1]!, status: m[2]! })],
  ["AI_TIMEOUT", /^(.+?) did not respond in time$/, "runs.errorShape.aiNoResponse", (m) => ({ provider: m[1]! })],
  ["AI_OVERLOADED", /^(.+?) is overloaded \((\d+)\)$/, "runs.errorShape.aiOverloaded", (m) => ({ provider: m[1]!, status: m[2]! })],
  ["AI_PROVIDER_ERROR", /^(.+?) had a server error \((\d+)\)$/, "runs.errorShape.aiServerError", (m) => ({ provider: m[1]!, status: m[2]! })],
  ["AI_UNAVAILABLE", /^(.+?) is unreachable$/, "runs.errorShape.aiUnreachable", (m) => ({ provider: m[1]! })],
  [
    "AI_QUOTA_EXCEEDED",
    /^(.+?) says this account has no balance or quota left \((\d+)( \[[^\]]+\])?\)\. Check the provider's billing; the call was not retried\.$/,
    "runs.errorShape.aiQuota",
    (m) => ({ provider: m[1]!, status: m[2]!, code: withCode(m, 3) }),
  ],
  ["AI_QUOTA_EXCEEDED", /^(.+?) reports a spend limit \(429 without retry-after\)\. Raise the limit in the Claude Console; the call was not retried\.$/, "runs.errorShape.aiSpendLimit", (m) => ({ provider: m[1]! })],
  ["AI_FORBIDDEN", /^(.+?) refused access \(403\): this key may not be allowed to use (.+)\.$/, "runs.errorShape.aiForbidden", (m) => ({ provider: m[1]!, model: m[2]! })],
  [
    "AI_MODEL_REMOVED",
    /^(.+?) isn't available on this (.+?) connection anymore \((\d+)\)\. Pick another model, or refresh the model list\.$/,
    "runs.errorShape.aiModelRemoved",
    (m) => ({ model: m[1]!, provider: m[2]!, status: m[3]! }),
  ],
  [
    "AI_BAD_REQUEST",
    /^(.+?) rejected the request \((\d+)\)( \[[^\]]+\])?\. Check the step settings \(model, output schema, max tokens\)\.$/,
    "runs.errorShape.aiBadRequest",
    (m) => ({ provider: m[1]!, status: m[2]!, code: withCode(m, 3) }),
  ],
  [
    "AI_SAFETY_REFUSAL",
    /^(.+?) blocked this request with its content moderation \((\d+)( \[[^\]]+\])?\)\. Nothing was retried or sent elsewhere\.$/,
    "runs.errorShape.aiBlocked",
    (m) => ({ provider: m[1]!, status: m[2]!, code: withCode(m, 3) }),
  ],
  ["AI_SAFETY_REFUSAL", /^(.+?) refused to answer \((.+?)\)\. Nothing was retried or sent elsewhere\.$/, "runs.errorShape.aiRefused", (m) => ({ provider: m[1]!, reason: m[2]! })],
  [
    "AI_COST_UNKNOWN",
    /^The price of (.+?) is unknown and this workspace has a spending cap, so the call was not sent\. Add its price in Settings → Usage \((ai:.+?)\) or allow unknown-cost calls\.$/,
    "runs.errorShape.aiCostWorkspace",
    (m) => ({ model: m[1]!, route: m[2]! }),
  ],
  [
    "AI_COST_UNKNOWN",
    /^The price of (.+?) is unknown and this agent has a cost limit, so the call was not sent\. Add its price in Settings → Usage \((ai:.+?)\), or let this agent make unknown-price calls outside its limit\.$/,
    "runs.errorShape.aiCostAgent",
    (m) => ({ model: m[1]!, route: m[2]! }),
  ],
  ["AI_CONNECTION_REVOKED", /^The AI connection "(.+)" was disconnected\. Choose another connection or reconnect it in Settings → AI Providers\.$/s, "runs.errorShape.aiConnectionRevoked", (m) => ({ label: m[1]! })],
  ["AI_CONNECTION_MISSING", /^The AI connection this uses no longer exists in this workspace\. Pick another model\.$/, "runs.errorShape.aiConnectionMissing"],
  [
    "AI_ROUTE_FORBIDDEN",
    /^The person this runs for isn't allowed to use the AI connection "(.+)"\. An owner can allow their role in Settings → AI Providers\.$/s,
    "runs.errorShape.aiRouteForbidden",
    (m) => ({ label: m[1]! }),
  ],
  ["BUDGET_EXCEEDED", /^Monthly budget reached \((.+?) of (.+?) used; this step needs up to (.+?)\)$/, "runs.errorShape.budget", (m) => ({ spent: m[1]!, budget: m[2]!, need: m[3]! })],

  /* App connections (src/server/connections.ts, worker/handlers.ts) */
  ["CONNECTION_REVOKED", /^(.+) was revoked — reconnect it$/s, "runs.errorShape.connRevoked", (m) => ({ label: m[1]! })],
  ["CONNECTION_EXPIRED", /^(.+?) needs to be reconnected \((.+)\)$/s, "runs.errorShape.connExpired", (m, t) => ({ label: m[1]!, reason: reasonText(t, m[2]!) })],
  ["CONNECTION_EXPIRED", new RegExp(`^(.+?): (${Object.keys(CONNECTION_REASONS).map(esc).join("|")})$`, "s"), "runs.errorShape.connExpiredReason", (m, t) => ({ label: m[1]!, reason: reasonText(t, m[2]!) })],
  ["CONNECTION_EXPIRED", /^(.+) changed while refreshing — try again$/s, "runs.errorShape.connChanged", (m) => ({ label: m[1]! })],
  ["CONNECTION_SCOPE", /^(.+?) is missing permission: (.+)$/s, "runs.errorShape.connScope", (m) => ({ label: m[1]!, scopes: m[2]! })],
  ["CONNECTION_AUTH", /^(.+?) rejected the connection \((.+)\)\. Flows using it are paused until it's reconnected\.$/s, "runs.errorShape.connAuth", (m) => ({ provider: m[1]!, detail: m[2]! })],
  ["CONNECTION_MISSING", /^The connection used by this step no longer exists$/, "runs.errorShape.connMissing"],
  ["CONNECTION_PRIVATE", /^(.+) is a private connection of another member — use your own connection$/s, "runs.errorShape.connPrivate", (m) => ({ label: m[1]! })],

  /* Runs and the engine */
  ["WORKER_LOST", /^The worker stopped responding (\d+) times$/, "runs.errorShape.workerLost", (m) => ({ count: m[1]! })],
  ["RUN_TIMEOUT", /^The run exceeded its time budget$/, "runs.errorShape.runTimeout"],
  ["RUN_TIMEOUT", /^The run exceeded its (\d+) minute time budget$/, "runs.errorShape.runTimeoutMinutes", (m) => ({ minutes: m[1]! })],
  ["CANCELLED", /^Run was cancelled$/, "runs.errorShape.runCancelled"],
  ["CANCELLED", /^Cancelled$/, "runs.errorShape.cancelled"],
  ["LOOP_LIMIT", /^(\d+) items exceeds this loop's limit of (\d+) — raise it or filter first$/, "runs.errorShape.loopLimit", (m) => ({ count: m[1]!, max: m[2]! })],
  ["PROVIDER_TIMEOUT", /^(.+?) kept failing to respond$/, "runs.errorShape.providerTimeout", (m) => ({ provider: m[1]! })],
  ["PROVIDER_CONTRACT", /^(.+?) returned an unexpected response shape$/, "runs.errorShape.providerContract", (m) => ({ provider: m[1]! })],
];

const SHAPES_BY_CODE = new Map<string, Shape[]>();
for (const shape of SHAPES) SHAPES_BY_CODE.set(shape[0], [...(SHAPES_BY_CODE.get(shape[0]) ?? []), shape]);

/**
 * A step/run error as shown to the user, in the UI language. Order: a stored message of a known shape is translated with
 * its data (provider, status, label…); a code with a fixed catalogue text (`runs.errorText.<CODE>`, e.g. a platform
 * outage) is shown translated; anything else keeps the stored message (provider/engine text), so nothing is hidden.
 */
export function stepErrorText(t: Translator, error: { code?: string | null; message?: string | null } | null | undefined, ctx: RunMessageContext = {}): string {
  if (!error) return "";
  const { code } = error;
  const text = error.message ?? "";
  if (ctx.userNote) return text;
  if (code) {
    for (const [, re, key, vars] of SHAPES_BY_CODE.get(code) ?? []) {
      const m = re.exec(text);
      if (m) return t(key, vars?.(m, t, ctx));
    }
    if (code === "APPROVAL_REQUIRED") {
      // Not the worker's wording (an older run, say): the wait is still known by its code. Name it from what the caller has.
      const title = (ctx.actionId ? actionTitleById(t, ctx.actionId) : null) ?? ctx.nodeLabel;
      if (title) return t("runs.errorShape.approvalWait", { title });
    }
    if (code === "APPROVAL_UNSTABLE_INPUT") {
      const detail = detailText(t, text);
      if (detail !== text) return detail;
    }
    const key = `runs.errorText.${code}`;
    if (t.has(key)) return t(key as MessageKey);
    // The AI hub catalogue also covers uncommon provider codes that do not need a run-specific
    // sentence. Keep the code's stable, localized explanation instead of exposing raw English.
    const aiKey = `aiHub.errors.${code}`;
    if (code.startsWith("AI_") && t.has(aiKey)) return t(aiKey as MessageKey);
  }
  return text;
}

/** Why a step was skipped (engine `skipReason`). */
const SKIP_SHAPES: readonly (readonly [RegExp, MessageKey, ((m: RegExpExecArray) => Vars)?])[] = [
  [/^Not reached$/, "runs.skipReason.notReached"],
  [/^Run was cancelled$/, "runs.skipReason.runCancelled"],
  [/^Run ended$/, "runs.skipReason.runEnded"],
  [/^Upstream step "(.+)" failed$/s, "runs.skipReason.upstreamFailed", (m) => ({ label: m[1]! })],
  [/^Upstream step "(.+)" was cancelled$/s, "runs.skipReason.upstreamCancelled", (m) => ({ label: m[1]! })],
  [/^Upstream step "(.+)" was skipped$/s, "runs.skipReason.upstreamSkipped", (m) => ({ label: m[1]! })],
  [/^Condition "(.+)" took the (\S+) branch$/s, "runs.skipReason.conditionBranch", (m) => ({ label: m[1]!, branch: m[2]! })],
];

/** A step's skip reason in the UI language; unknown text is returned unchanged. */
export function skipReasonText(t: Translator, reason: string): string {
  for (const [re, key, vars] of SKIP_SHAPES) {
    const m = re.exec(reason);
    if (m) return t(key, vars?.(m));
  }
  return reason;
}
