CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."trigger_kind" ADD VALUE 'api';--> statement-breakpoint
ALTER TYPE "public"."trigger_kind" ADD VALUE 'agent';--> statement-breakpoint
CREATE TABLE "agent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"current_version_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"conversation_id" uuid,
	"status" "agent_run_status" DEFAULT 'queued' NOT NULL,
	"input" text NOT NULL,
	"output" text,
	"citations" jsonb,
	"error" jsonb,
	"step_count" integer DEFAULT 0 NOT NULL,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"acting_user_id" text NOT NULL,
	"api_key_id" uuid,
	"state" jsonb,
	"locked_by" text,
	"heartbeat_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"cancel_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_step" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"kind" text NOT NULL,
	"tool" text,
	"args" jsonb,
	"decision" text,
	"approval_id" uuid,
	"result" jsonb,
	"error" jsonb,
	"latency_ms" integer,
	"cost_micros" bigint,
	"input_tokens" integer,
	"output_tokens" integer,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"instructions" text NOT NULL,
	"provider" text,
	"model" text,
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"knowledge_source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"limits" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mode" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_key_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_user_id" text,
	"actor_api_key_id" uuid,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"data" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_account" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"customer_id" text NOT NULL,
	"subscription_id" text,
	"plan_id" text,
	"status" text DEFAULT 'none' NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"current_period_end" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"last_event_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_account_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "billing_event" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" uuid,
	"outcome" text NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "copilot_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"flow_id" uuid NOT NULL,
	"base_revision" integer NOT NULL,
	"request" text NOT NULL,
	"patch" jsonb,
	"proposed_graph" jsonb,
	"diff" jsonb,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"provider" text,
	"model" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"saved_revision" integer
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunk" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	"locator" jsonb,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', text)) STORED
);
--> statement-breakpoint
CREATE TABLE "knowledge_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"file_id" uuid,
	"mime" text,
	"size" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"locked_by" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"indexed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sso_config" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_enc" text NOT NULL,
	"key_id" text NOT NULL,
	"domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_role" "workspace_role" DEFAULT 'viewer' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_state" (
	"state" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"nonce" text NOT NULL,
	"code_verifier_enc" text NOT NULL,
	"key_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"metric" text NOT NULL,
	"quantity" bigint NOT NULL,
	"ledger_total" bigint NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_report_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "workspace_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "workspace_role" NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "workspace_invite_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "approval" ALTER COLUMN "run_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "approval" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "connection" ADD COLUMN "visibility" text DEFAULT 'workspace' NOT NULL;--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "usage_event" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "usage_event" ADD COLUMN "billable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_event" ADD COLUMN "retry" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_event" ADD COLUMN "estimated_micros" bigint;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "max_monthly_executions" integer;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "ai_provider" text;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "ai_model" text;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversation" ADD CONSTRAINT "agent_conversation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversation" ADD CONSTRAINT "agent_conversation_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversation" ADD CONSTRAINT "agent_conversation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_agent_version_id_agent_version_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_conversation_id_agent_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_step" ADD CONSTRAINT "agent_step_agent_run_id_agent_run_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_version" ADD CONSTRAINT "agent_version_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_version" ADD CONSTRAINT "agent_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_account" ADD CONSTRAINT "billing_account_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_proposal" ADD CONSTRAINT "copilot_proposal_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_proposal" ADD CONSTRAINT "copilot_proposal_flow_id_flow_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_proposal" ADD CONSTRAINT "copilot_proposal_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunk" ADD CONSTRAINT "knowledge_chunk_source_id_knowledge_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source" ADD CONSTRAINT "knowledge_source_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source" ADD CONSTRAINT "knowledge_source_file_id_file_object_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source" ADD CONSTRAINT "knowledge_source_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_config" ADD CONSTRAINT "sso_config_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_report" ADD CONSTRAINT "usage_report_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invite" ADD CONSTRAINT "workspace_invite_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invite" ADD CONSTRAINT "workspace_invite_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invite" ADD CONSTRAINT "workspace_invite_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_ws_idx" ON "agent" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_conv_idx" ON "agent_conversation" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_run_queue_idx" ON "agent_run" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "agent_run_agent_idx" ON "agent_run" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_step_unique" ON "agent_step" USING btree ("agent_run_id","index");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_version_unique" ON "agent_version" USING btree ("agent_id","version");--> statement-breakpoint
CREATE INDEX "api_key_ws_idx" ON "api_key" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "audit_ws_idx" ON "audit_event" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "copilot_flow_idx" ON "copilot_proposal" USING btree ("flow_id","created_at");--> statement-breakpoint
CREATE INDEX "kchunk_source_idx" ON "knowledge_chunk" USING btree ("source_id","generation");--> statement-breakpoint
CREATE INDEX "kchunk_tsv_idx" ON "knowledge_chunk" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "ksource_ws_idx" ON "knowledge_source" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "usage_report_ws_idx" ON "usage_report" USING btree ("workspace_id","period_start");--> statement-breakpoint
CREATE INDEX "invite_ws_idx" ON "workspace_invite" USING btree ("workspace_id","created_at");