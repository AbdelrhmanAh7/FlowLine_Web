CREATE TABLE "ai_attempt" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"run_id" uuid,
	"agent_run_id" uuid,
	"node_id" text,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"connection_id" uuid,
	"model_id" text NOT NULL,
	"protocol" text NOT NULL,
	"policy" text DEFAULT 'MANUAL' NOT NULL,
	"attempt" integer NOT NULL,
	"outcome" text NOT NULL,
	"error_code" text,
	"http_status" integer,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"cache_write_tokens" integer,
	"reasoning_tokens" integer,
	"price_snapshot" jsonb,
	"cost_source" text NOT NULL,
	"cost_micros" bigint,
	"usage_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"secret_enc" text,
	"key_id" text,
	"key_hint" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"use_roles" jsonb DEFAULT '["owner"]'::jsonb NOT NULL,
	"status" text DEFAULT 'CONNECTED' NOT NULL,
	"verification" text DEFAULT 'IMPLEMENTED' NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_error" jsonb,
	"cred_version" integer DEFAULT 1 NOT NULL,
	"catalog_refreshed_at" timestamp with time zone,
	"catalog_stale" boolean DEFAULT false NOT NULL,
	"catalog_error" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_connection_model" (
	"connection_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"model_id" text NOT NULL,
	"owned_by" text,
	"listed" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"access_confirmed_at" timestamp with time zone,
	"last_error" jsonb,
	CONSTRAINT "ai_connection_model_connection_id_model_id_pk" PRIMARY KEY("connection_id","model_id")
);
--> statement-breakpoint
CREATE TABLE "ai_model" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"model_id" text NOT NULL,
	"display_name" text,
	"author" text,
	"serving_provider" text,
	"protocol" text NOT NULL,
	"capabilities" jsonb NOT NULL,
	"context_window" integer,
	"max_output_tokens" integer,
	"modalities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lifecycle" text DEFAULT 'unknown' NOT NULL,
	"pricing" jsonb,
	"price_source" text,
	"price_verified_at" timestamp with time zone,
	"free_tier_note" text,
	"privacy_note" text,
	"source" text NOT NULL,
	"snapshot_version" integer DEFAULT 1 NOT NULL,
	"stale" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "ai_default_route" jsonb;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "ai_policy" jsonb DEFAULT '{"mode":"MANUAL","allowUnknownCost":false}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_attempt" ADD CONSTRAINT "ai_attempt_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_attempt" ADD CONSTRAINT "ai_attempt_connection_id_ai_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ai_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_connection" ADD CONSTRAINT "ai_connection_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_connection" ADD CONSTRAINT "ai_connection_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_connection_model" ADD CONSTRAINT "ai_connection_model_connection_id_ai_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ai_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_connection_model" ADD CONSTRAINT "ai_connection_model_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_attempt_ws_time_idx" ON "ai_attempt" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_attempt_run_idx" ON "ai_attempt" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "ai_connection_ws_idx" ON "ai_connection" USING btree ("workspace_id","provider");--> statement-breakpoint
CREATE INDEX "ai_connection_model_ws_idx" ON "ai_connection_model" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_model_unique" ON "ai_model" USING btree ("provider","model_id");