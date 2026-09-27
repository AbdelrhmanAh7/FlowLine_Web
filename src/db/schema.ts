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
export const triggerKindEnum = pgEnum("trigger_kind", ["manual", "webhook", "schedule", "rerun", "subflow"]);

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
  },
  (t) => [uniqueIndex("webhook_event_unique").on(t.endpointId, t.eventId)],
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
    runId: uuid("run_id")
      .notNull()
      .references(() => run.id, { onDelete: "cascade" }),
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
    kind: text("kind").notNull(), // ai | action | http | run
    status: text("status").notNull(), // reserved | settled | released
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
