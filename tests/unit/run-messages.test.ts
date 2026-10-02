import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapProviderError, safetyRefusal } from "@/ai/hub/protocols/shared";
import { PROVIDERS, getProviderDef } from "@/ai/hub/registry";
import { UNSTABLE_INPUT_MESSAGE } from "@/engine/validate";
import { approvalActionId, stepApprovalId, CONNECTION_REASONS, skipReasonText, stepErrorText } from "@/i18n/engine-text";
import { ar as arCatalogue } from "@/i18n/messages/ar";
import { en as enCatalogue } from "@/i18n/messages/en";
import { createTranslator } from "@/i18n/translate";

const en = createTranslator("en");
const ar = createTranslator("ar");
const ARABIC = /[؀-ۿ]/;
const UNFILLED = /\{\w+\}/;

type Row = { code: string; message: string };
const err = (code: string, message: string): Row => ({ code, message });

/**
 * Messages exactly as the worker, engine and connection layer build them (the source file is named for each group, and
 * "emitters" below pins that those templates are still there). The AI hub messages come from the real `mapProviderError`.
 */
const STORED: Row[] = [
  // worker/handlers.ts
  err("APPROVAL_REQUIRED", "Waiting for approval to run Append row"),
  err("APPROVAL_REJECTED", "Append row was rejected"),
  err("APPROVAL_REJECTED", "Append row was rejected: wrong sheet"),
  err("OUTCOME_UNKNOWN", "No response from api.example.com — the request may have been applied. Mark it done, retry, or fail."),
  err("OUTCOME_UNKNOWN", "Append row may or may not have been applied by Google Sheets (lost response). Check it and choose: mark done, retry, or fail."),
  err("OUTCOME_UNKNOWN", '"Send digest" was interrupted and may have partly run steps with external effects. Check, then mark done, retry, or fail.'),
  err("OUTCOME_UNKNOWN", "The request's outcome was unknown and a reviewer failed the step"),
  err("OUTCOME_UNKNOWN", "Append row outcome was unknown and a reviewer failed the step"),
  err("OUTCOME_UNKNOWN", '"Send digest" was interrupted and a reviewer failed the step'),
  err("CANCELLED_IN_FLIGHT", "Cancelled while Append row was in flight — it may have been applied"),
  err("PROVIDER_TIMEOUT", "Google Sheets kept failing to respond"),
  err("PROVIDER_CONTRACT", "Google Sheets returned an unexpected response shape"),
  err("CONNECTION_AUTH", "Google Sheets rejected the connection (HTTP 401). Flows using it are paused until it's reconnected."),
  err("LOOP_LIMIT", "120 items exceeds this loop's limit of 100 — raise it or filter first"),
  err("CANCELLED", "Run was cancelled"),
  // worker/runner.ts, worker/agent-runner.ts
  err("WORKER_LOST", "The worker stopped responding 3 times"),
  err("RUN_TIMEOUT", "The run exceeded its time budget"),
  err("RUN_TIMEOUT", "The run exceeded its 15 minute time budget"),
  err("CANCELLED", "Cancelled"),
  // src/server/connections.ts
  err("CONNECTION_REVOKED", "Team Sheets was revoked — reconnect it"),
  err("CONNECTION_EXPIRED", "Team Sheets needs to be reconnected (expired)"),
  ...Object.keys(CONNECTION_REASONS).flatMap((reason) => [err("CONNECTION_EXPIRED", `Team Sheets needs to be reconnected (${reason})`), err("CONNECTION_EXPIRED", `Team Sheets: ${reason}`)]),
  err("CONNECTION_EXPIRED", "Team Sheets changed while refreshing — try again"),
  err("CONNECTION_SCOPE", "Team Sheets is missing permission: spreadsheets, drive.file"),
  err("CONNECTION_MISSING", "The connection used by this step no longer exists"),
  err("CONNECTION_PRIVATE", "Team Sheets is a private connection of another member — use your own connection"),
  // src/server/usage.ts
  err("BUDGET_EXCEEDED", "Monthly budget reached (9.9000 of 10.0000 used; this step needs up to 0.3000)"),
  // src/ai/hub: routing.ts, credentials.ts, execute.ts, transport.ts
  err("AI_CONNECTION_REVOKED", 'The AI connection "Team key" was disconnected. Choose another connection or reconnect it in Settings → AI Providers.'),
  err("AI_CONNECTION_MISSING", "The AI connection this uses no longer exists in this workspace. Pick another model."),
  err("AI_ROUTE_FORBIDDEN", 'The person this runs for isn\'t allowed to use the AI connection "Team key". An owner can allow their role in Settings → AI Providers.'),
  err("AI_COST_UNKNOWN", "The price of gpt-x is unknown and this workspace has a spending cap, so the call was not sent. Add its price in Settings → Usage (ai:openai/gpt-x) or allow unknown-cost calls."),
  err("AI_COST_UNKNOWN", "The price of gpt-x is unknown and this agent has a cost limit, so the call was not sent. Add its price in Settings → Usage (ai:openai/gpt-x), or let this agent make unknown-price calls outside its limit."),
  err("AI_TIMEOUT", "OpenAI did not respond in time"),
  err("AI_UNAVAILABLE", "OpenAI is unreachable"),
];

/** The real AI hub mapper, for every registered provider, over the statuses that carry translated shapes. */
function hubRows(): { row: Row; provider: string; status: number }[] {
  const out: { row: Row; provider: string; status: number }[] = [];
  const retryAfter = new Headers({ "retry-after": "1" });
  for (const def of PROVIDERS) {
    for (const status of [401, 402, 404, 408, 429, 500, 529]) {
      const e = mapProviderError(def, "model-x", status, retryAfter, {});
      out.push({ row: err(e.code, e.message), provider: def.name, status });
    }
  }
  return out;
}

describe("stepErrorText: English is unchanged", () => {
  it("returns every stored message byte for byte (fixtures and the real AI hub mapper for all providers)", () => {
    for (const row of [...STORED, ...hubRows().map((h) => h.row)]) expect(stepErrorText(en, row), `${row.code}: ${row.message}`).toBe(row.message);
  });

  it("keeps unrecognised messages and unknown codes untouched, in both languages", () => {
    for (const row of [err("HTTP_500", "Server said no"), err("PROVIDER_CLIENT", "The app rejected the request: bad range"), err("EXPRESSION_RUNTIME", "$number is not a function"), err("AI_AUTH_FAILED", "Something else entirely")]) {
      expect(stepErrorText(en, row)).toBe(row.message);
      expect(stepErrorText(ar, row)).toBe(row.message);
    }
    expect(stepErrorText(ar, null)).toBe("");
    expect(stepErrorText(ar, { code: null, message: null })).toBe("");
  });

  it("keeps the fixed-code texts (`runs.errorText`) working", () => {
    const row = err("PLATFORM_UNAVAILABLE", "This step was interrupted because Flowline's database was unavailable. Nothing is wrong with the step itself.");
    expect(stepErrorText(en, row)).toBe(row.message);
    expect(ARABIC.test(stepErrorText(ar, row))).toBe(true);
  });
});

describe("stepErrorText: Arabic", () => {
  it("translates every fixture, leaves no placeholder unfilled, and keeps the data that matters", () => {
    const untranslated: string[] = [];
    for (const row of STORED) {
      const text = stepErrorText(ar, row);
      expect(UNFILLED.test(text), `${row.code}: ${text}`).toBe(false);
      if (text === row.message) untranslated.push(`${row.code}: ${row.message}`);
      else expect(ARABIC.test(text), text).toBe(true);
    }
    expect(untranslated).toEqual([]);
  });

  it("the QA cases (DV2-Q01): an approval wait and an AI 401 show in Arabic with their data", () => {
    const wait = stepErrorText(ar, err("APPROVAL_REQUIRED", "Waiting for approval to run Append row"));
    expect(wait).toBe("بانتظار الموافقة لتشغيل Append row");
    const auth = stepErrorText(ar, err("AI_AUTH_FAILED", "OpenAI rejected the API key (401). Rotate the key in Settings → AI Providers."));
    expect(auth).toContain("OpenAI");
    expect(auth).toContain("401");
    expect(ARABIC.test(auth)).toBe(true);
    expect(auth).not.toMatch(/rejected|Rotate/);
  });

  it("names the approval's action in Arabic when the run's approval record gives its id", () => {
    const row = err("APPROVAL_REQUIRED", "Waiting for approval to run Append row");
    expect(stepErrorText(ar, row, { actionId: "google_sheets.append_row" })).toBe("بانتظار الموافقة لتشغيل إضافة صف");
    expect(stepErrorText(en, row, { actionId: "google_sheets.append_row" })).toBe("Waiting for approval to run Append row"); // English catalogue title = the stored one
    // Unknown action id: the stored English title stays.
    expect(stepErrorText(ar, row, { actionId: "nope.nothing" })).toBe("بانتظار الموافقة لتشغيل Append row");
    // A message that isn't the worker's wording: the code still names the wait, from the node's label.
    expect(stepErrorText(ar, err("APPROVAL_REQUIRED", "Pending"), { nodeLabel: "Log order" })).toBe("بانتظار الموافقة لتشغيل Log order");
    expect(stepErrorText(ar, err("APPROVAL_REQUIRED", "Pending"))).toBe("Pending");
  });

  it("translates the unstable-input refusal through the existing issue text", () => {
    expect(ARABIC.test(stepErrorText(ar, err("APPROVAL_UNSTABLE_INPUT", UNSTABLE_INPUT_MESSAGE)))).toBe(true);
    expect(stepErrorText(en, err("APPROVAL_UNSTABLE_INPUT", UNSTABLE_INPUT_MESSAGE))).toBe(UNSTABLE_INPUT_MESSAGE);
  });

  it("the real AI hub mapper: every provider's auth / quota / rate-limit / timeout / overload / server / model errors are translated with provider and status", () => {
    for (const { row, provider, status } of hubRows()) {
      const text = stepErrorText(ar, row);
      expect(text, `${provider} ${status}: ${row.message}`).not.toBe(row.message);
      expect(ARABIC.test(text)).toBe(true);
      expect(UNFILLED.test(text), text).toBe(false);
      // The provider (or, for a removed model, the model id) and the HTTP status are kept as data.
      if (row.code !== "AI_MODEL_REMOVED") expect(text).toContain(provider);
      expect(text).toContain(String(status));
    }
  });

  it("the provider's documented error id and the reason of a refusal survive as data", () => {
    const openai = getProviderDef("openai")!;
    const quota = mapProviderError(openai, "gpt-x", 429, new Headers({ "retry-after": "1" }), { error: { type: "insufficient_quota" } });
    expect(quota.message).toContain("[insufficient_quota]");
    expect(stepErrorText(en, quota)).toBe(quota.message);
    expect(stepErrorText(ar, quota)).toContain("[insufficient_quota]");
    const bad = mapProviderError(openai, "gpt-x", 400, null, { error: { type: "invalid_request_error" } });
    expect(stepErrorText(ar, bad)).toContain("[invalid_request_error]");
    const blocked = safetyRefusal(openai, "content_filter");
    expect(stepErrorText(en, blocked)).toBe(blocked.message);
    expect(stepErrorText(ar, blocked)).toContain("content_filter");
    const spend = mapProviderError(getProviderDef("anthropic")!, "claude-x", 429, new Headers(), {});
    expect(spend.code).toBe("AI_QUOTA_EXCEEDED");
    expect(stepErrorText(en, spend)).toBe(spend.message);
    expect(stepErrorText(ar, spend)).not.toBe(spend.message);
  });

  it("connection reasons are translated inside the sentence; a provider's own status text stays", () => {
    const text = stepErrorText(ar, err("CONNECTION_EXPIRED", "Team Sheets needs to be reconnected (The OAuth app changed — reconnect it)"));
    expect(text).toContain("Team Sheets");
    expect(text).toContain("تغيّر تطبيق OAuth");
    expect(stepErrorText(ar, err("CONNECTION_EXPIRED", "Team Sheets needs to be reconnected (invalid_grant)"))).toContain("invalid_grant");
  });
});

describe("skipReasonText", () => {
  const reasons = ["Not reached", "Run was cancelled", "Run ended", 'Upstream step "Fetch orders" failed', 'Upstream step "Fetch orders" was cancelled', 'Upstream step "Fetch orders" was skipped', 'Condition "Big order?" took the false branch'];
  it("is identical in English and translated in Arabic (with the step and branch names kept)", () => {
    for (const r of reasons) {
      expect(skipReasonText(en, r)).toBe(r);
      const text = skipReasonText(ar, r);
      expect(text).not.toBe(r);
      expect(ARABIC.test(text)).toBe(true);
      expect(UNFILLED.test(text)).toBe(false);
    }
    expect(skipReasonText(ar, 'Condition "Big order?" took the false branch')).toBe("سلك الشرط «Big order?» الفرع false");
    expect(skipReasonText(ar, "Something else")).toBe("Something else");
  });
});

describe("approvalActionId", () => {
  it("does not attribute ambiguous approval history to a different action", () => {
    for (const status of ["pending", "approved"]) {
      const records = [{ nodeId: "a", actionId: "slack.post", status }, { nodeId: "a", actionId: "google_sheets.append_row", status }];
      expect(approvalActionId(records, "a")).toBeNull();
      expect(approvalActionId([...records].reverse(), "a")).toBeNull();
      expect(approvalActionId([...records, { nodeId: "b", actionId: "slack.post", status }], "b")).toBe("slack.post");
      expect(approvalActionId([records[0]!, records[0]!], "a")).toBe("slack.post");
    }
  });
  it("prefers the pending approval of the node and ignores other nodes", () => {
    const approvals = [
      { nodeId: "a", actionId: "gmail.send", status: "approved" },
      { nodeId: "a", actionId: "google_sheets.append_row", status: "pending" },
      { nodeId: "b", actionId: "slack.post", status: "pending" },
    ];
    expect(approvalActionId(approvals, "a")).toBe("google_sheets.append_row");
    expect(approvalActionId(approvals, "b")).toBe("slack.post");
    expect(approvalActionId(approvals, "c")).toBeNull();
    expect(approvalActionId(undefined, "a")).toBeNull();
    expect(approvalActionId(approvals, undefined)).toBeNull();
  });
});

describe("approvalActionId with the step's own approval id", () => {
  const approvals = [
    { id: "p1", nodeId: "a", actionId: "slack.post", status: "approved" },
    { id: "p2", nodeId: "a", actionId: "gmail.send", status: "pending" },
    { id: "p3", nodeId: "b", actionId: "slack.post", status: "pending" },
  ];
  it("returns exactly the named approval's action, even when the node has several", () => {
    expect(approvalActionId(approvals, "a", "p1")).toBe("slack.post");
    expect(approvalActionId(approvals, "a", "p2")).toBe("gmail.send");
  });
  it("never uses an approval of another node or an unknown id", () => {
    expect(approvalActionId(approvals, "a", "p3")).toBeNull();
    expect(approvalActionId(approvals, "a", "missing")).toBeNull();
  });
  it("reads the id from step meta only when it is a string", () => {
    expect(stepApprovalId({ meta: { approvalId: "p1" } })).toBe("p1");
    expect(stepApprovalId({ meta: { approvalId: 5 } })).toBeNull();
    expect(stepApprovalId({ meta: null })).toBeNull();
    expect(stepApprovalId(undefined)).toBeNull();
  });
  it("reviewer text that looks like an action id is never used as one", () => {
    const t = ar;
    const out = stepErrorText(t, err("APPROVAL_REJECTED", "Post message was rejected: slack.post"), { actionId: null });
    expect(out).toContain("slack.post");
    expect(approvalActionId([{ id: "x", nodeId: "a", actionId: "gmail.send", status: "rejected" }], "a", "x")).toBe("gmail.send");
  });
});

describe("reviewer notes are preserved user data", () => {
  for (const t of [en, ar]) {
    it(`${t.locale}: preserves generated-looking, multiline and markup notes`, () => {
      for (const message of ["Delete issue was rejected: keep this wording", "لا تحذف البيانات\nراجع الطلب أولًا", "<script>alert('text only')</script>"]) {
        expect(stepErrorText(t, err("APPROVAL_REJECTED", message), { userNote: true })).toBe(message);
      }
    });
  }
});

describe("catalogue", () => {
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
  const leaves = (o: Record<string, unknown>, prefix = ""): [string, string][] =>
    Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v as Record<string, unknown>, `${prefix}${k}.`)));

  for (const group of ["errorShape", "skipReason"] as const) {
    it(`runs.${group}: Arabic and English have the same keys and the same placeholders`, () => {
      const enLeaves = new Map(leaves(enCatalogue.runs[group] as unknown as Record<string, unknown>));
      const arLeaves = new Map(leaves(arCatalogue.runs[group] as unknown as Record<string, unknown>));
      expect([...arLeaves.keys()].sort()).toEqual([...enLeaves.keys()].sort());
      for (const [key, text] of enLeaves) expect(placeholders(arLeaves.get(key)!), key).toEqual(placeholders(text));
    });
  }

  it("every connection reason has a catalogue text in both languages", () => {
    for (const key of Object.values(CONNECTION_REASONS)) {
      expect(en.has(key), key).toBe(true);
      expect(ar.has(key), key).toBe(true);
    }
  });
});

describe("emitters: the stored templates are still what the mapping reads", () => {
  const worker = readFileSync("worker/handlers.ts", "utf8");
  const runner = readFileSync("worker/runner.ts", "utf8");
  const connections = readFileSync("src/server/connections.ts", "utf8");
  const shared = readFileSync("src/ai/hub/protocols/shared.ts", "utf8");

  it("worker/handlers.ts and worker/runner.ts", () => {
    for (const fragment of [
      "`Waiting for approval to run ${action.title}`",
      "`${action.title} was rejected${gate.note ? `: ${gate.note}` : \"\"}`",
      "`No response from ${new URL(url).host} — the request may have been applied. Mark it done, retry, or fail.`",
      "`${action.title} may or may not have been applied by ${provider.name} (lost response). Check it and choose: mark done, retry, or fail.`",
      "`${action.title} outcome was unknown and a reviewer failed the step`",
      "`\"${sub.name}\" was interrupted and may have partly run steps with external effects. Check, then mark done, retry, or fail.`",
      "`\"${sub.name}\" was interrupted and a reviewer failed the step`",
      "\"The request's outcome was unknown and a reviewer failed the step\"",
      "`${provider.name} rejected the connection (${pe.message}). Flows using it are paused until it's reconnected.`",
      "`${provider.name} kept failing to respond`",
      "`${provider.name} returned an unexpected response shape`",
      "`Cancelled while ${action.title} was in flight — it may have been applied`",
      "`${items.length} items exceeds this loop's limit of ${maxItems} — raise it or filter first`",
    ]) expect(worker, fragment).toContain(fragment);
    expect(runner).toContain("`The worker stopped responding ${MAX_ATTEMPTS} times`");
    expect(runner).toContain('"The run exceeded its time budget"');
    expect(runner).toContain("`The run exceeded its ${Math.round(SEGMENT_TIMEOUT_MS / 60000)} minute time budget`");
  });

  it("src/server/connections.ts: the reasons and the connection sentences", () => {
    for (const reason of Object.keys(CONNECTION_REASONS)) expect(connections, reason).toContain(`"${reason}"`);
    for (const fragment of [
      "`${conn.label} was revoked — reconnect it`",
      "`${conn.label} needs to be reconnected (",
      "`${conn.label} is missing permission: ${missing.join(\", \")}`",
      "`${conn.label} changed while refreshing — try again`",
      "`${conn.label}: ${STATUS_REASONS[reason]}`",
    ]) {
      expect(connections, fragment).toContain(fragment);
    }
  });

  it("the AI hub sentences come from mapProviderError (exercised for real above); a few are pinned here", () => {
    for (const fragment of ["rejected the API key (${status}). Rotate the key in Settings → AI Providers.", "rate-limited the request (${status})", "timed out (${status})", "is overloaded (${status})", "had a server error (${status})"]) {
      expect(shared, fragment).toContain(fragment);
    }
  });
});
