import { sql } from "drizzle-orm";
import {
  boolean,
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

export const runStatusEnum = pgEnum("run_status", ["queued", "running", "succeeded", "failed", "cancelled"]);
export const stepStatusEnum = pgEnum("step_status", ["pending", "running", "succeeded", "failed", "skipped", "reused"]);

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

export type Role = (typeof roleEnum.enumValues)[number];
export type RunStatus = (typeof runStatusEnum.enumValues)[number];
export type StepStatus = (typeof stepStatusEnum.enumValues)[number];
