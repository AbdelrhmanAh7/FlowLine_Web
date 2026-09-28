import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { FlowGraph } from "@/engine/types";

/* ───────────── better-auth core tables ───────────── */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailOutbox = pgTable("email_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  plainText: text("plain_text").notNull(),
  tags: jsonb("tags").$type<Record<string, string>>().notNull().default({}),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailToken = pgTable("email_token", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  purpose: text("purpose").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("email_token_user_purpose_idx").on(t.userId, t.purpose)]);

export const emailRateLimit = pgTable("email_rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(1),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────── Flowline domain ───────────── */

export const roleEnum = pgEnum("workspace_role", ["owner", "editor", "viewer"]);

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  onboardingGoal: text("onboarding_goal"),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  onboardingSkipped: boolean("onboarding_skipped").notNull().default(false),
  lastWorkspaceId: uuid("last_workspace_id"),
});

export const workspace = pgTable("workspace", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("UTC"),
  runCounter: integer("run_counter").notNull().default(0),
  /** Max runs executing at once for this workspace (worker enforces at claim time). */
  maxConcurrentRuns: integer("max_concurrent_runs").notNull().default(3),
  /** Max runs waiting in the queue; enqueue beyond this is refused (429). */
  maxQueuedRuns: integer("max_queued_runs").notNull().default(100),
  /** Monthly spend limit in micro-units of `currency` (null = no limit). Enforced before costed steps. */
  monthlyBudgetMicros: bigint("monthly_budget_micros", { mode: "number" }),
  currency: text("currency").notNull().default("USD"),
  /** Price table used by the usage ledger: { "<provider>/<model>": { inputPerMTok, outputPerMTok }, "action": perAction } in micros. */
  prices: jsonb("prices").$type<PriceTable>().notNull().default({}),
  /** Monthly execution limit (runs + agent runs); null = unlimited. Plans may set it. */
  maxMonthlyExecutions: integer("max_monthly_executions"),
  /**
   * LEGACY (pre AI hub): server-configured provider/model. Kept readable; never used for execution. A legacy
   * "ollama" value is refused with AI_LOCAL_MIGRATION_REQUIRED (it is never converted silently).
   */
  aiProvider: text("ai_provider"),
  aiModel: text("ai_model"),
  /** AI hub: workspace default route (a workspace AI connection + model id). Null = no default. */
  aiDefaultRoute: jsonb("ai_default_route").$type<AiRouteRef | null>(),
  /** AI execution policy (Wave A: MANUAL only). */
  aiPolicy: jsonb("ai_policy").$type<AiPolicy>().notNull().default({ mode: "MANUAL", allowUnknownCost: false }),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMember = pgTable(
  "workspace_member",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index("member_user_idx").on(t.userId)],
);

export const flow = pgTable(
  "flow",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    graph: jsonb("graph").$type<FlowGraph>().notNull(),
    /** Monotonic; every accepted save bumps it. Used for optimistic concurrency. */
    revision: integer("revision").notNull().default(1),
    templateId: text("template_id"),
    /** Immutable version that triggers (webhook/schedule) execute. Null = never published. */
    publishedVersionId: uuid("published_version_id"),
    publishedBy: text("published_by").references(() => user.id, { onDelete: "set null" }),
    /** Set when a connection the published version uses is expired/revoked; only this flow pauses. */
    pausedReason: text("paused_reason"),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("flow_workspace_idx").on(t.workspaceId, t.updatedAt)],
);

export const flowVersion = pgTable(
  "flow_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => flow.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    revision: integer("revision").notNull(),
    name: text("name").notNull(),
    graph: jsonb("graph").$type<FlowGraph>().notNull(),
    /** "save" = explicit save, "run" = snapshot pinned for a run, "overwrite" = server copy kept before an offline overwrite */
    reason: text("reason").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("flow_version_unique").on(t.flowId, t.version)],
);

export const runStatusEnum = pgEnum("run_status", ["queued", "running", "waiting_approval", "succeeded", "failed", "cancelled"]);
/** `uncertain` = an external action was sent but its outcome is unknown (lost response) and could not be verified. */
export const stepStatusEnum = pgEnum("step_status", ["pending", "running", "succeeded", "failed", "skipped", "reused", "waiting_approval", "uncertain", "cancelled"]);
export const triggerKindEnum = pgEnum("trigger_kind", ["manual", "webhook", "schedule", "rerun", "subflow", "api", "agent"]);

export const run = pgTable(
  "run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => flow.id, { onDelete: "cascade" }),
    flowVersionId: uuid("flow_version_id")
      .notNull()
      .references(() => flowVersion.id, { onDelete: "restrict" }),
    /** Per-workspace sequence shown as #n in the UI. */
    number: integer("number").notNull(),
    status: runStatusEnum("status").notNull().default("queued"),
    input: jsonb("input"),
    output: jsonb("output"),
    error: jsonb("error").$type<{ code: string; message: string; nodeId?: string } | null>(),
    rerunOfRunId: uuid("rerun_of_run_id"),
    rerunFromNodeId: text("rerun_from_node_id"),
    /** Set when an agent's run_workflow tool started this run. */
    agentRunId: uuid("agent_run_id"),
    /** Set when the invocation API started this run. */
    apiKeyId: uuid("api_key_id"),
    triggerKind: triggerKindEnum("trigger_kind").notNull().default("manual"),
    /** Webhook event id / schedule fire time — for traceability and dedupe. */
    triggerRef: text("trigger_ref"),
    parentRunId: uuid("parent_run_id"),
    parentNodeId: text("parent_node_id"),
    /** Permission policy snapshot: acting user, connections bound per node, approval requirements. Re-checked at execution. */
    policy: jsonb("policy").$type<RunPolicy>(),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    cancelRequestedBy: text("cancel_requested_by"),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lockedBy: text("locked_by"),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
  },
  (t) => [
    uniqueIndex("run_workspace_number").on(t.workspaceId, t.number),
    index("run_flow_idx").on(t.flowId, t.createdAt),
    index("run_queue_idx").on(t.status, t.createdAt).where(sql`status in ('queued','running')`),
    // One run per trigger event (webhook event id / schedule fire / manual click id): DB-level dedupe.
    uniqueIndex("run_trigger_unique").on(t.flowId, t.triggerKind, t.triggerRef).where(sql`trigger_ref is not null`),
  ],
);

export const runStep = pgTable(
  "run_step",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => run.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    nodeType: text("node_type").notNull(),
    nodeLabel: text("node_label").notNull(),
    position: integer("position").notNull(),
    status: stepStatusEnum("status").notNull().default("pending"),
    input: jsonb("input"),
    output: jsonb("output"),
    error: jsonb("error").$type<{ code: string; message: string } | null>(),
    skipReason: text("skip_reason"),
    attempts: integer("attempts").notNull().default(0),
    /** Provider/model/tokens for AI steps; request ids for actions. Redacted. */
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    log: jsonb("log").$type<string[]>(),
    /**
     * Unredacted {input, output} of a finished step, AES-GCM encrypted. Used only to resume or
     * re-run (so downstream steps and approval bindings see real values); never returned by APIs.
     */
    dataEnc: jsonb("data_enc").$type<{ ciphertext: string; keyId: string }>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
  },
  (t) => [uniqueIndex("run_step_unique").on(t.runId, t.nodeId)],
);

export const workerHeartbeat = pgTable("worker_heartbeat", {
  workerId: text("worker_id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────── Phase 2: connections, triggers, approvals, usage, events ───────────── */

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const connectionStatusEnum = pgEnum("connection_status", ["active", "expired", "revoked", "error"]);

/** Credentials live here — never in flow graphs. Secret material is AES-256-GCM encrypted. */
export const connection = pgTable(
  "connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    label: text("label").notNull(),
    authType: text("auth_type").notNull(),
    /** External account identity; reconnect must match it. */
    accountId: text("account_id").notNull(),
    accountLabel: text("account_label").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    /** Non-secret settings (subdomain, account URL). */
    settings: jsonb("settings").$type<Record<string, string>>().notNull().default({}),
    secretEnc: text("secret_enc").notNull(),
    keyId: text("key_id").notNull(),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
    status: connectionStatusEnum("status").notNull().default("active"),
    statusReason: text("status_reason"),
    /** Bumped on every credential change (refresh/reconnect) — detects refresh races. */
    credVersion: integer("cred_version").notNull().default(1),
    /** "workspace" = any editor may use it; "private" = only its creator's runs may use it (never shared). */
    visibility: text("visibility").notNull().default("workspace"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("connection_ws_idx").on(t.workspaceId, t.provider)],
);

/** OAuth authorization requests: CSRF state + PKCE verifier, bound to user/workspace/provider, single use, short-lived. */
export const oauthState = pgTable("oauth_state", {
  state: text("state").primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  codeVerifierEnc: text("code_verifier_enc"),
  /** Set when reconnecting: the connection to restore (identity must match). */
  connectionId: uuid("connection_id"),
  redirectAfter: text("redirect_after"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const webhookEndpoint = pgTable("webhook_endpoint", {
  id: uuid("id").primaryKey().defaultRandom(),
  flowId: uuid("flow_id")
    .notNull()
    .unique()
    .references(() => flow.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  /** Public, unguessable path token. */
  token: text("token").notNull().unique(),
  secretEnc: text("secret_enc").notNull(),
  keyId: text("key_id").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
});

/** Every accepted webhook delivery. (endpoint, event_id) is unique → duplicates return the original run. */
export const webhookEvent = pgTable(
  "webhook_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoint.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    bodySha256: text("body_sha256").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    runId: uuid("run_id"),
    status: text("status").notNull(), // accepted | paused | rejected
    detail: text("detail"),
    /** GitHub-scheme signature (no timestamp is signed there): unique per endpoint to refuse replays. */
    signature: text("signature"),
  },
  (t) => [uniqueIndex("webhook_event_unique").on(t.endpointId, t.eventId), uniqueIndex("webhook_event_signature_unique").on(t.endpointId, t.signature)],
);

export const missedPolicyEnum = pgEnum("missed_policy", ["skip", "run_once", "run_all"]);

export const schedule = pgTable("schedule", {
  id: uuid("id").primaryKey().defaultRandom(),
  flowId: uuid("flow_id")
    .notNull()
    .unique()
    .references(() => flow.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  cron: text("cron").notNull(),
  timezone: text("timezone").notNull(),
  missedPolicy: missedPolicyEnum("missed_policy").notNull().default("skip"),
  active: boolean("active").notNull().default(true),
  nextFireAt: timestamp("next_fire_at", { withTimezone: true }),
  lastFireAt: timestamp("last_fire_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per scheduled fire time; unique (schedule, fire_at) makes firing exactly-once across workers. */
export const scheduleFire = pgTable(
  "schedule_fire",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => schedule.id, { onDelete: "cascade" }),
    fireAt: timestamp("fire_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(), // enqueued | skipped_missed | skipped_paused | skipped_limit
    runId: uuid("run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("schedule_fire_unique").on(t.scheduleId, t.fireAt)],
);

export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected", "expired", "superseded"]);

/**
 * A human decision bound to ONE run + flow revision + node + action + exact arguments
 * (sha256) + connection, with an expiry. Never reusable across runs or argument changes.
 * kind "approval" = sensitive action gate; kind "review" = uncertain external outcome.
 */
export const approval = pgTable(
  "approval",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    /** Workflow run the decision belongs to (null for agent tool approvals). */
    runId: uuid("run_id").references(() => run.id, { onDelete: "cascade" }),
    /** Agent run the decision belongs to (agent tool ASK); flowVersionId then holds the agent version id. */
    agentRunId: uuid("agent_run_id"),
    flowVersionId: uuid("flow_version_id").notNull(),
    nodeId: text("node_id").notNull(),
    kind: text("kind").notNull(),
    actionId: text("action_id").notNull(),
    argsHash: text("args_hash").notNull(),
    /** Redacted preview of the arguments shown to the approver. */
    argsPreview: jsonb("args_preview"),
    connectionId: uuid("connection_id"),
    status: approvalStatusEnum("status").notNull().default("pending"),
    /** For reviews: "done" | "retry" | "fail". */
    resolution: text("resolution"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    note: text("note"),
  },
  (t) => [index("approval_run_idx").on(t.runId, t.nodeId), index("approval_ws_pending_idx").on(t.workspaceId, t.status)],
);

/** Durable usage ledger. idempotency_key is unique so retries never double-count. */
export const usageEvent = pgTable(
  "usage_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    runId: uuid("run_id"),
    nodeId: text("node_id"),
    kind: text("kind").notNull(), // ai | action | http | execution | agent_step
    status: text("status").notNull(), // reserved | settled | released
    agentRunId: uuid("agent_run_id"),
    /** False for system actions that are recorded but never charged (e.g. verification calls). */
    billable: boolean("billable").notNull().default(true),
    /** True when this event is a retry attempt of an earlier one. */
    retry: boolean("retry").notNull().default(false),
    /** Estimated cost at reservation time; costMicros is the actual cost once settled. */
    estimatedMicros: bigint("estimated_micros", { mode: "number" }),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    provider: text("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    quantity: integer("quantity").notNull().default(1),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    /** True when no price is configured for this provider/model (cost recorded as 0, flagged). */
    unpriced: boolean("unpriced").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [index("usage_ws_time_idx").on(t.workspaceId, t.createdAt)],
);

/** Append-only run event log (queued, claimed, step started/retried/failed, approval, cancel…). */
export const runEvent = pgTable(
  "run_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => run.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    type: text("type").notNull(),
    nodeId: text("node_id"),
    data: jsonb("data"),
  },
  (t) => [index("run_event_run_idx").on(t.runId, t.id)],
);

/** Small per-workspace key/value state for flows (e.g. last seen competitor price). */
export const kvEntry = pgTable(
  "kv_entry",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    namespace: text("namespace").notNull(),
    key: text("key").notNull(),
    value: jsonb("value"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.namespace, t.key] })],
);

/** Uploaded files for CSV/JSON/PDF processing (size-capped). */
export const fileObject = pgTable("file_object", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  data: bytea("data").notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export interface PriceEntry {
  inputPerMTokMicros?: number;
  outputPerMTokMicros?: number;
  perCallMicros?: number;
}
export type PriceTable = Record<string, PriceEntry>;

export interface RunPolicy {
  /** User whose permissions the run executes with (manual runner, or the flow publisher for triggers). */
  actingUserId: string;
  /** connectionId per node, captured at enqueue; re-authorized at execution. */
  connections: Record<string, string>;
}

export type Role = (typeof roleEnum.enumValues)[number];
export type RunStatus = (typeof runStatusEnum.enumValues)[number];
export type StepStatus = (typeof stepStatusEnum.enumValues)[number];

/* ───────────── Phase 3: collaboration, audit, API keys ───────────── */

/** Invitation to a workspace. Only a SHA-256 hash of the token is stored; single use, bound to an email, expiring. */
export const workspaceInvite = pgTable(
  "workspace_invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: roleEnum("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: text("accepted_by").references(() => user.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("invite_ws_idx").on(t.workspaceId, t.createdAt)],
);

/** Append-only audit trail of security- and billing-relevant changes. `data` is redacted before insert. */
export const auditEvent = pgTable(
  "audit_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id"),
    actorApiKeyId: uuid("actor_api_key_id"),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    data: jsonb("data"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_ws_idx").on(t.workspaceId, t.id)],
);

/** Workspace API key. The secret is shown once; only its SHA-256 hash and a display prefix are stored. */
export const apiKey = pgTable(
  "api_key",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mode: text("mode").notNull(), // test | live
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("api_key_ws_idx").on(t.workspaceId)],
);

/* ───────────── Phase 3: knowledge ───────────── */

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const knowledgeSource = pgTable(
  "knowledge_source",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // file | text | table
    fileId: uuid("file_id").references(() => fileObject.id, { onDelete: "set null" }),
    mime: text("mime"),
    size: integer("size").notNull().default(0),
    status: text("status").notNull().default("pending"), // pending | indexing | ready | failed
    error: text("error"),
    chunkCount: integer("chunk_count").notNull().default(0),
    /** Bumped on every (re)index; chunks carry the generation they belong to. */
    generation: integer("generation").notNull().default(1),
    /** Disabled sources are never retrieved (workspace-level revoke). */
    enabled: boolean("enabled").notNull().default(true),
    lockedBy: text("locked_by"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("ksource_ws_idx").on(t.workspaceId, t.status)],
);

export const knowledgeChunk = pgTable(
  "knowledge_chunk",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSource.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull(),
    generation: integer("generation").notNull(),
    ordinal: integer("ordinal").notNull(),
    text: text("text").notNull(),
    /** Location inside the source, e.g. { page } or { row }. */
    locator: jsonb("locator").$type<Record<string, unknown>>(),
    tsv: tsvector("tsv").generatedAlwaysAs(sql`to_tsvector('english', text)`),
  },
  (t) => [index("kchunk_source_idx").on(t.sourceId, t.generation), index("kchunk_tsv_idx").using("gin", t.tsv)],
);

/* ───────────── Phase 3: agents ───────────── */

export type ToolPermission = "allow" | "ask" | "deny";
export interface AgentToolSpec {
  /** knowledge_search | workflow_inspect | run_workflow */
  tool: string;
  /** For run_workflow / workflow_inspect: the published flow it targets. */
  flowId?: string;
  permission: ToolPermission;
}
export interface AgentLimits {
  maxSteps: number;
  maxToolCalls: number;
  maxCostMicros: number | null;
  timeoutMs: number;
}

export const agent = pgTable(
  "agent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    currentVersionId: uuid("current_version_id"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("agent_ws_idx").on(t.workspaceId)],
);

/** Immutable agent definition; every save creates a new version. */
export const agentVersion = pgTable(
  "agent_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agent.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    instructions: text("instructions").notNull(),
    provider: text("provider"),
    model: text("model"),
    tools: jsonb("tools").$type<AgentToolSpec[]>().notNull().default([]),
    knowledgeSourceIds: jsonb("knowledge_source_ids").$type<string[]>().notNull().default([]),
    limits: jsonb("limits").$type<AgentLimits>().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agent_version_unique").on(t.agentId, t.version)],
);

export const agentConversation = pgTable(
  "agent_conversation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agent.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_conv_idx").on(t.agentId, t.createdAt)],
);

export const agentRunStatusEnum = pgEnum("agent_run_status", ["queued", "running", "waiting_approval", "succeeded", "failed", "cancelled"]);

export const agentRun = pgTable(
  "agent_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agent.id, { onDelete: "cascade" }),
    agentVersionId: uuid("agent_version_id")
      .notNull()
      .references(() => agentVersion.id, { onDelete: "restrict" }),
    conversationId: uuid("conversation_id").references(() => agentConversation.id, { onDelete: "set null" }),
    status: agentRunStatusEnum("status").notNull().default("queued"),
    input: text("input").notNull(),
    output: text("output"),
    citations: jsonb("citations").$type<{ sourceId: string; sourceName: string; ordinal: number; label: string }[]>(),
    error: jsonb("error").$type<{ code: string; message: string } | null>(),
    stepCount: integer("step_count").notNull().default(0),
    toolCallCount: integer("tool_call_count").notNull().default(0),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    actingUserId: text("acting_user_id").notNull(),
    apiKeyId: uuid("api_key_id"),
    /** Conversation/model state needed to resume after an approval pause. */
    state: jsonb("state"),
    lockedBy: text("locked_by"),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("agent_run_queue_idx").on(t.status, t.createdAt), index("agent_run_agent_idx").on(t.agentId, t.createdAt)],
);

/** One model turn or tool call of an agent run (append-only). */
export const agentStep = pgTable(
  "agent_step",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRun.id, { onDelete: "cascade" }),
    index: integer("index").notNull(),
    kind: text("kind").notNull(), // model | tool
    tool: text("tool"),
    args: jsonb("args"),
    decision: text("decision"), // allow | ask | deny | approved | rejected
    approvalId: uuid("approval_id"),
    result: jsonb("result"),
    error: jsonb("error").$type<{ code: string; message: string } | null>(),
    latencyMs: integer("latency_ms"),
    costMicros: bigint("cost_micros", { mode: "number" }),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agent_step_unique").on(t.agentRunId, t.index)],
);

/* ───────────── Phase 3: copilot ───────────── */

export const copilotProposal = pgTable(
  "copilot_proposal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    /** Null for a "Create with Copilot" proposal: the flow is created only when the proposal is approved. */
    flowId: uuid("flow_id").references(() => flow.id, { onDelete: "cascade" }),
    baseRevision: integer("base_revision").notNull(),
    request: text("request").notNull(),
    patch: jsonb("patch"),
    proposedGraph: jsonb("proposed_graph").$type<FlowGraph>(),
    diff: jsonb("diff"),
    issues: jsonb("issues").$type<{ code: string; message: string; severity: "error" | "warning"; nodeId?: string }[]>().notNull().default([]),
    status: text("status").notNull(), // invalid | proposed | approved | rejected | stale
    provider: text("provider"),
    model: text("model"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    savedRevision: integer("saved_revision"),
  },
  (t) => [index("copilot_flow_idx").on(t.flowId, t.createdAt)],
);

/* ───────────── Phase 3: billing ───────────── */

/** One billing account per workspace with the payment provider (test mode unless the owner authorises live). */
export const billingAccount = pgTable("billing_account", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspace.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  customerId: text("customer_id").notNull().unique(),
  subscriptionId: text("subscription_id"),
  planId: text("plan_id"),
  /** none | trialing | active | past_due | paused | canceled | incomplete */
  status: text("status").notNull().default("none"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  trialEnd: timestamp("trial_end", { withTimezone: true }),
  /** `created` time of the last applied provider event: older events are ignored (out-of-order). */
  lastEventAt: timestamp("last_event_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Every provider webhook event received (deduplicated by provider event id). */
export const billingEvent = pgTable("billing_event", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  type: text("type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  workspaceId: uuid("workspace_id"),
  /** applied | applied_canonical | ignored_stale | ignored_unknown_customer | ignored_type | failed */
  outcome: text("outcome").notNull(),
  detail: text("detail"),
});

/** Usage reported to the payment provider for a period: one row per reported delta (idempotent per idempotency key, which embeds the ledger total). */
export const usageReport = pgTable(
  "usage_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    metric: text("metric").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
    ledgerTotal: bigint("ledger_total", { mode: "number" }).notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status").notNull(), // reported | failed
    error: text("error"),
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_report_ws_idx").on(t.workspaceId, t.periodStart)],
);

/* ───────────── Phase 3: SSO ───────────── */

/** Per-workspace OIDC configuration. Not "available" until a test sign-in has succeeded (verifiedAt). */
export const ssoConfig = pgTable("sso_config", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspace.id, { onDelete: "cascade" }),
  issuer: text("issuer").notNull(),
  clientId: text("client_id").notNull(),
  clientSecretEnc: text("client_secret_enc").notNull(),
  keyId: text("key_id").notNull(),
  /** Email domains allowed to sign in via this IdP. */
  domains: jsonb("domains").$type<string[]>().notNull().default([]),
  /** Role given to a new member who first signs in via SSO. */
  defaultRole: roleEnum("default_role").notNull().default("viewer"),
  enabled: boolean("enabled").notNull().default(false),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Pending SSO sign-ins: single-use state + nonce + PKCE verifier (encrypted), short-lived. */
export const ssoState = pgTable("sso_state", {
  state: text("state").primaryKey(),
  workspaceId: uuid("workspace_id").notNull(),
  nonce: text("nonce").notNull(),
  codeVerifierEnc: text("code_verifier_enc").notNull(),
  keyId: text("key_id").notNull(),
  /** The signed-in user who started this sign-in, if any — the only account an email match may link to. */
  initiatorUserId: text("initiator_user_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/** Private beta: single- or multi-use access codes for sign-up (stored hashed; the code is shown once when created). */
export const betaAccessCode = pgTable("beta_access_code", {
  id: uuid("id").primaryKey().defaultRandom(),
  codeHash: text("code_hash").notNull().unique(),
  label: text("label").notNull(),
  maxUses: integer("max_uses").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * First-user product telemetry (P4-15). Event names, ids, counts, types and error codes ONLY — never payloads, prompts,
 * document text, emails, tokens or keys. The correlation id ties an event to the request/log line that produced it.
 */
export const productEvent = pgTable(
  "product_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    name: text("name").notNull(),
    workspaceId: uuid("workspace_id"),
    userId: text("user_id"),
    props: jsonb("props").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    correlationId: text("correlation_id"),
  },
  (t) => [index("product_event_name_at_idx").on(t.name, t.at), index("product_event_ws_idx").on(t.workspaceId, t.at)],
);

/** Shared sliding-window rate limiting (P4-13): one row per hit, keys hashed; old hits are removed on each check. */
export const rateLimitHit = pgTable("rate_limit_hit", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("rate_limit_hit_key_at_idx").on(t.key, t.at)]);

/* ───────────── AI provider hub (cloud-only, workspace BYOK) ───────────── */

/** A route reference: which workspace AI connection and which model id on it. Never carries secrets. */
export interface AiRouteRef {
  connectionId: string;
  modelId: string;
}

export interface AiPolicy {
  mode: "MANUAL";
  /** Allow calls whose price is unknown even when a hard budget cap applies (the owner accepts the risk). */
  allowUnknownCost: boolean;
}

/** Tri-state capability (route level): never assume support that isn't documented or observed. */
export type CapabilityState = "SUPPORTED" | "UNSUPPORTED" | "UNKNOWN";

export interface AiModelCapabilities {
  tools: CapabilityState;
  structuredOutput: CapabilityState;
  vision: CapabilityState;
  streaming: CapabilityState;
  reasoning: CapabilityState;
}

/** Prices in micro-units (of the workspace currency) per million tokens. A missing field means UNKNOWN (never 0). */
export interface AiModelPricing {
  inputPerMTokMicros?: number;
  outputPerMTokMicros?: number;
  cacheReadPerMTokMicros?: number;
  cacheWritePerMTokMicros?: number;
}

/**
 * Workspace BYOK AI connection. The API key is AES-256-GCM encrypted (same crypto as SaaS connections) and never
 * returned. Connecting does NOT grant members: `use_roles` defaults to ["owner"].
 * status: CONNECTED | DEGRADED (last test/call failed) | REVOKED (disconnected; secret wiped).
 * verification: IMPLEMENTED | CONTRACT_VERIFIED | LIVE_VERIFIED (never claimed without evidence).
 */
export const aiConnection = pgTable(
  "ai_connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    label: text("label").notNull(),
    /** Null once disconnected (REVOKED). */
    secretEnc: text("secret_enc"),
    keyId: text("key_id"),
    /** Non-secret masked indicator captured at save time ("••••" + last 4 chars). The key itself is never returned. */
    keyHint: text("key_hint"),
    /** Non-secret settings (e.g. an owner-approved custom base URL). */
    settings: jsonb("settings").$type<Record<string, string>>().notNull().default({}),
    useRoles: jsonb("use_roles").$type<string[]>().notNull().default(["owner"]),
    status: text("status").notNull().default("CONNECTED"),
    verification: text("verification").notNull().default("IMPLEMENTED"),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastError: jsonb("last_error").$type<{ code: string; message: string; at: string } | null>(),
    credVersion: integer("cred_version").notNull().default(1),
    catalogRefreshedAt: timestamp("catalog_refreshed_at", { withTimezone: true }),
    /** True when the last catalogue refresh failed or was malformed: the last valid snapshot is kept. */
    catalogStale: boolean("catalog_stale").notNull().default(false),
    catalogError: text("catalog_error"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("ai_connection_ws_idx").on(t.workspaceId, t.provider)],
);

/**
 * Public catalogue snapshot per provider (curated, versioned, with provenance). Credential-specific listings never
 * land here (they could reveal one tenant's fine-tuned model names to another): see ai_connection_model.
 */
export const aiModel = pgTable(
  "ai_model",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    modelId: text("model_id").notNull(),
    displayName: text("display_name"),
    author: text("author"),
    /** For gateways: the upstream provider actually serving the model. */
    servingProvider: text("serving_provider"),
    protocol: text("protocol").notNull(),
    capabilities: jsonb("capabilities").$type<AiModelCapabilities>().notNull(),
    contextWindow: integer("context_window"),
    maxOutputTokens: integer("max_output_tokens"),
    modalities: jsonb("modalities").$type<string[]>().notNull().default([]),
    lifecycle: text("lifecycle").notNull().default("unknown"),
    pricing: jsonb("pricing").$type<AiModelPricing | null>(),
    priceSource: text("price_source"),
    priceVerifiedAt: timestamp("price_verified_at", { withTimezone: true }),
    freeTierNote: text("free_tier_note"),
    privacyNote: text("privacy_note"),
    source: text("source").notNull(),
    snapshotVersion: integer("snapshot_version").notNull().default(1),
    stale: boolean("stale").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ai_model_unique").on(t.provider, t.modelId)],
);

/** Credential-specific access: what this connection's listing returned, and whether an inference succeeded. */
export const aiConnectionModel = pgTable(
  "ai_connection_model",
  {
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => aiConnection.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    modelId: text("model_id").notNull(),
    ownedBy: text("owned_by"),
    listed: boolean("listed").notNull().default(true),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when the provider stopped listing it or answered "model not found". */
    removedAt: timestamp("removed_at", { withTimezone: true }),
    accessConfirmedAt: timestamp("access_confirmed_at", { withTimezone: true }),
    lastError: jsonb("last_error").$type<{ code: string; message: string; at: string } | null>(),
  },
  (t) => [primaryKey({ columns: [t.connectionId, t.modelId] }), index("ai_connection_model_ws_idx").on(t.workspaceId)],
);

/**
 * One row per provider attempt (retries are separate rows). Token fields are NON-OVERLAPPING:
 * input = uncached input, cache_read / cache_write = cached input, output = visible output, reasoning = hidden
 * reasoning output (count only; reasoning text is never stored). Linked to the budget ledger (usage_event) by
 * `usage_key`. cost_micros is NULL when the price is unknown (cost_source = "unknown"), never 0.
 */
export const aiAttempt = pgTable(
  "ai_attempt",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    runId: uuid("run_id"),
    agentRunId: uuid("agent_run_id"),
    nodeId: text("node_id"),
    /** node | agent | copilot | connection_test */
    purpose: text("purpose").notNull(),
    provider: text("provider").notNull(),
    connectionId: uuid("connection_id").references(() => aiConnection.id, { onDelete: "set null" }),
    modelId: text("model_id").notNull(),
    protocol: text("protocol").notNull(),
    policy: text("policy").notNull().default("MANUAL"),
    attempt: integer("attempt").notNull(),
    /** success | error | refused | timeout */
    outcome: text("outcome").notNull(),
    errorCode: text("error_code"),
    httpStatus: integer("http_status"),
    latencyMs: integer("latency_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    reasoningTokens: integer("reasoning_tokens"),
    priceSnapshot: jsonb("price_snapshot").$type<(AiModelPricing & { source: string }) | null>(),
    /** provider_reported | estimated | unknown */
    costSource: text("cost_source").notNull(),
    costMicros: bigint("cost_micros", { mode: "number" }),
    usageKey: text("usage_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_attempt_ws_time_idx").on(t.workspaceId, t.createdAt), index("ai_attempt_run_idx").on(t.runId)],
);
