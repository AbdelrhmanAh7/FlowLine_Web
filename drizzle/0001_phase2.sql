CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'expired', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('active', 'expired', 'revoked', 'error');--> statement-breakpoint
CREATE TYPE "public"."missed_policy" AS ENUM('skip', 'run_once', 'run_all');--> statement-breakpoint
CREATE TYPE "public"."trigger_kind" AS ENUM('manual', 'webhook', 'schedule', 'rerun', 'subflow');--> statement-breakpoint
ALTER TYPE "public"."run_status" ADD VALUE 'waiting_approval' BEFORE 'succeeded';--> statement-breakpoint
ALTER TYPE "public"."step_status" ADD VALUE 'waiting_approval';--> statement-breakpoint
ALTER TYPE "public"."step_status" ADD VALUE 'uncertain';--> statement-breakpoint
ALTER TYPE "public"."step_status" ADD VALUE 'cancelled';--> statement-breakpoint
CREATE TABLE "approval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"flow_version_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"kind" text NOT NULL,
	"action_id" text NOT NULL,
	"args_hash" text NOT NULL,
	"args_preview" jsonb,
	"connection_id" uuid,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"resolution" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"auth_type" text NOT NULL,
	"account_id" text NOT NULL,
	"account_label" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_enc" text NOT NULL,
	"key_id" text NOT NULL,
	"access_expires_at" timestamp with time zone,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"status_reason" text,
	"cred_version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "file_object" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kv_entry" (
	"workspace_id" uuid NOT NULL,
	"namespace" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kv_entry_workspace_id_namespace_key_pk" PRIMARY KEY("workspace_id","namespace","key")
);
--> statement-breakpoint
CREATE TABLE "oauth_state" (
	"state" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"code_verifier_enc" text,
	"connection_id" uuid,
	"redirect_after" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "run_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"node_id" text,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE "schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"cron" text NOT NULL,
	"timezone" text NOT NULL,
	"missed_policy" "missed_policy" DEFAULT 'skip' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"next_fire_at" timestamp with time zone,
	"last_fire_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_flow_id_unique" UNIQUE("flow_id")
);
--> statement-breakpoint
CREATE TABLE "schedule_fire" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"schedule_id" uuid NOT NULL,
	"fire_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid,
	"node_id" text,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider" text,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"quantity" integer DEFAULT 1 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"unpriced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "usage_event_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"token" text NOT NULL,
	"secret_enc" text NOT NULL,
	"key_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	CONSTRAINT "webhook_endpoint_flow_id_unique" UNIQUE("flow_id"),
	CONSTRAINT "webhook_endpoint_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "webhook_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"body_sha256" text NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_id" uuid,
	"status" text NOT NULL,
	"detail" text
);
--> statement-breakpoint
ALTER TABLE "flow" ADD COLUMN "published_version_id" uuid;--> statement-breakpoint
ALTER TABLE "flow" ADD COLUMN "published_by" text;--> statement-breakpoint
ALTER TABLE "flow" ADD COLUMN "paused_reason" text;--> statement-breakpoint
ALTER TABLE "flow" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "trigger_kind" "trigger_kind" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "trigger_ref" text;--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "parent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "parent_node_id" text;--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "policy" jsonb;--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "cancel_requested_by" text;--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "run_step" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "run_step" ADD COLUMN "meta" jsonb;--> statement-breakpoint
ALTER TABLE "run_step" ADD COLUMN "log" jsonb;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "max_concurrent_runs" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "max_queued_runs" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "monthly_budget_micros" bigint;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "prices" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_object" ADD CONSTRAINT "file_object_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_object" ADD CONSTRAINT "file_object_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kv_entry" ADD CONSTRAINT "kv_entry_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD CONSTRAINT "oauth_state_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD CONSTRAINT "oauth_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_event" ADD CONSTRAINT "run_event_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_flow_id_flow_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_fire" ADD CONSTRAINT "schedule_fire_schedule_id_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_flow_id_flow_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_event" ADD CONSTRAINT "webhook_event_endpoint_id_webhook_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_run_idx" ON "approval" USING btree ("run_id","node_id");--> statement-breakpoint
CREATE INDEX "approval_ws_pending_idx" ON "approval" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "connection_ws_idx" ON "connection" USING btree ("workspace_id","provider");--> statement-breakpoint
CREATE INDEX "run_event_run_idx" ON "run_event" USING btree ("run_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_fire_unique" ON "schedule_fire" USING btree ("schedule_id","fire_at");--> statement-breakpoint
CREATE INDEX "usage_ws_time_idx" ON "usage_event" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_event_unique" ON "webhook_event" USING btree ("endpoint_id","event_id");--> statement-breakpoint
ALTER TABLE "flow" ADD CONSTRAINT "flow_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;