CREATE TABLE "cb_activation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"installation_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"state" text NOT NULL,
	"reason" text,
	"binding_hash" text,
	"review_item_id" uuid,
	"decided_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cb_blueprint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"profile_version" integer NOT NULL,
	"generator" text NOT NULL,
	"status" text DEFAULT 'review_required' NOT NULL,
	"body" jsonb NOT NULL,
	"diff" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cb_cli_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"session_id" uuid,
	"kind" text NOT NULL,
	"cli" text NOT NULL,
	"status" text DEFAULT 'waiting_operator' NOT NULL,
	"request_key" text NOT NULL,
	"envelope" jsonb NOT NULL,
	"result" jsonb,
	"result_blueprint_id" uuid,
	"error" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"repair_attempts" integer DEFAULT 0 NOT NULL,
	"reported" jsonb,
	"locked_by" text,
	"heartbeat_at" timestamp with time zone,
	"cancel_requested_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cb_entitlement" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'dev_trial' NOT NULL,
	"status" text NOT NULL,
	"granted_by" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cb_installation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"blueprint_id" uuid NOT NULL,
	"install_key" text NOT NULL,
	"status" text DEFAULT 'installing' NOT NULL,
	"error" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cb_installed_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"pack_id" text,
	"pack_version" integer,
	"definition_hash" text NOT NULL,
	"base_revision" integer,
	"origin" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cb_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"facts" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cb_review_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"installation_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"kind" text NOT NULL,
	"trial_id" uuid,
	"blueprint_version" integer NOT NULL,
	"task_version" text NOT NULL,
	"source" jsonb NOT NULL,
	"proposed" jsonb NOT NULL,
	"recipient" text,
	"connection" jsonb,
	"reviewer_role" text NOT NULL,
	"binding_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"note" text,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cb_sample_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"review_item_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"provenance" text DEFAULT 'mocked_integration' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cb_sample_outbox_review_item_id_unique" UNIQUE("review_item_id")
);
--> statement-breakpoint
CREATE TABLE "cb_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"state" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"profile_version" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cb_trial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"installation_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"flow_id" uuid,
	"run_id" uuid,
	"trial_key" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"provenance" text NOT NULL,
	"verdict" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "cb_activation" ADD CONSTRAINT "cb_activation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_activation" ADD CONSTRAINT "cb_activation_installation_id_cb_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."cb_installation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_activation" ADD CONSTRAINT "cb_activation_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_blueprint" ADD CONSTRAINT "cb_blueprint_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_blueprint" ADD CONSTRAINT "cb_blueprint_session_id_cb_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cb_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_blueprint" ADD CONSTRAINT "cb_blueprint_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_blueprint" ADD CONSTRAINT "cb_blueprint_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_cli_job" ADD CONSTRAINT "cb_cli_job_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_cli_job" ADD CONSTRAINT "cb_cli_job_session_id_cb_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cb_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_cli_job" ADD CONSTRAINT "cb_cli_job_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_entitlement" ADD CONSTRAINT "cb_entitlement_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_entitlement" ADD CONSTRAINT "cb_entitlement_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_installation" ADD CONSTRAINT "cb_installation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_installation" ADD CONSTRAINT "cb_installation_blueprint_id_cb_blueprint_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."cb_blueprint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_installation" ADD CONSTRAINT "cb_installation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_installed_item" ADD CONSTRAINT "cb_installed_item_installation_id_cb_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."cb_installation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_profile" ADD CONSTRAINT "cb_profile_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_profile" ADD CONSTRAINT "cb_profile_session_id_cb_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cb_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_profile" ADD CONSTRAINT "cb_profile_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_review_item" ADD CONSTRAINT "cb_review_item_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_review_item" ADD CONSTRAINT "cb_review_item_installation_id_cb_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."cb_installation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_review_item" ADD CONSTRAINT "cb_review_item_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_review_item" ADD CONSTRAINT "cb_review_item_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_sample_outbox" ADD CONSTRAINT "cb_sample_outbox_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_sample_outbox" ADD CONSTRAINT "cb_sample_outbox_review_item_id_cb_review_item_id_fk" FOREIGN KEY ("review_item_id") REFERENCES "public"."cb_review_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_session" ADD CONSTRAINT "cb_session_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_session" ADD CONSTRAINT "cb_session_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_trial" ADD CONSTRAINT "cb_trial_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_trial" ADD CONSTRAINT "cb_trial_installation_id_cb_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."cb_installation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_trial" ADD CONSTRAINT "cb_trial_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cb_activation_task" ON "cb_activation" USING btree ("installation_id","task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cb_blueprint_version" ON "cb_blueprint" USING btree ("session_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "cb_cli_job_request" ON "cb_cli_job" USING btree ("workspace_id","request_key");--> statement-breakpoint
CREATE INDEX "cb_cli_job_queue_idx" ON "cb_cli_job" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cb_installation_key" ON "cb_installation" USING btree ("install_key");--> statement-breakpoint
CREATE INDEX "cb_installation_ws_idx" ON "cb_installation" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cb_installed_item_unique" ON "cb_installed_item" USING btree ("installation_id","task_id","kind");--> statement-breakpoint
CREATE INDEX "cb_installed_item_ref_idx" ON "cb_installed_item" USING btree ("workspace_id","ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cb_profile_version" ON "cb_profile" USING btree ("session_id","version");--> statement-breakpoint
CREATE INDEX "cb_review_ws_idx" ON "cb_review_item" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cb_review_open" ON "cb_review_item" USING btree ("installation_id","task_id","kind","binding_hash");--> statement-breakpoint
CREATE INDEX "cb_session_ws_idx" ON "cb_session" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cb_trial_key" ON "cb_trial" USING btree ("installation_id","task_id","trial_key");--> statement-breakpoint
CREATE INDEX "cb_trial_task_idx" ON "cb_trial" USING btree ("installation_id","task_id","created_at");