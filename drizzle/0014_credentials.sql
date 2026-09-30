CREATE TABLE "platform_admin" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"last_totp_step" bigint
);
--> statement-breakpoint
CREATE TABLE "platform_audit_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" text,
	"actor_label" text NOT NULL,
	"assurance" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"purpose" text,
	"old_revision" integer,
	"new_revision" integer,
	"result" text NOT NULL,
	"request_id" text,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE "platform_env_import" (
	"purpose" text PRIMARY KEY NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_event_id" bigint NOT NULL,
	"recipient_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"last_error_code" text
);
--> statement-breakpoint
CREATE TABLE "platform_secret" (
	"id" uuid PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"public_id" text,
	"secret_enc" text,
	"key_id" text,
	"revision" integer DEFAULT 0 NOT NULL,
	"secret_hint" text,
	"set_by" text,
	"set_at" timestamp with time zone,
	"prev_secret_enc" text,
	"prev_key_id" text,
	"prev_revision" integer,
	"prev_valid_until" timestamp with time zone,
	"status" text DEFAULT 'configured_unverified' NOT NULL,
	"verified_revision" integer,
	"verified_at" timestamp with time zone,
	"verified_via" text,
	"last_probe_at" timestamp with time zone,
	"last_probe_result" text,
	"epoch" integer DEFAULT 1 NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_secret_purpose_unique" UNIQUE("purpose")
);
--> statement-breakpoint
CREATE TABLE "platform_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"set_by" text NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_setup" (
	"id" integer PRIMARY KEY NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" text
);
--> statement-breakpoint
CREATE TABLE "platform_setup_challenge" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"session_hash" text,
	"session_expires_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"consumed_by" text,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "platform_setup_challenge_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "platform_stepup" (
	"session_token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"method" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signin_attempt" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workspace_oauth_app" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"family" text NOT NULL,
	"client_id" text NOT NULL,
	"secret_enc" text,
	"key_id" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"secret_hint" text,
	"prev_secret_enc" text,
	"prev_key_id" text,
	"prev_revision" integer,
	"prev_valid_until" timestamp with time zone,
	"status" text DEFAULT 'configured_unverified' NOT NULL,
	"verified_revision" integer,
	"verified_at" timestamp with time zone,
	"epoch" integer DEFAULT 1 NOT NULL,
	"set_by" text,
	"set_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "connection" ADD COLUMN "legacy_crypto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "connection" ADD COLUMN "oauth_app_source" text;--> statement-breakpoint
ALTER TABLE "connection" ADD COLUMN "oauth_app_id" uuid;--> statement-breakpoint
ALTER TABLE "connection" ADD COLUMN "oauth_client_id" text;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD COLUMN "session_hash" text;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD COLUMN "app_source" text;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD COLUMN "app_id" uuid;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD COLUMN "app_revision" integer;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD COLUMN "app_epoch" integer;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD COLUMN "redirect_uri" text;--> statement-breakpoint
ALTER TABLE "run_step" ADD COLUMN "data_legacy" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sso_config" ADD COLUMN "legacy_crypto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD COLUMN "legacy_crypto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_admin" ADD CONSTRAINT "platform_admin_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_oauth_app" ADD CONSTRAINT "workspace_oauth_app_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_oauth_app" ADD CONSTRAINT "workspace_oauth_app_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_audit_at_idx" ON "platform_audit_event" USING btree ("at");--> statement-breakpoint
CREATE INDEX "platform_audit_purpose_idx" ON "platform_audit_event" USING btree ("purpose","id");--> statement-breakpoint
CREATE INDEX "platform_notification_pending_idx" ON "platform_notification" USING btree ("sent_at","next_attempt_at");--> statement-breakpoint
CREATE INDEX "two_factor_user_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_oauth_app_id_ws" ON "workspace_oauth_app" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_oauth_app_active" ON "workspace_oauth_app" USING btree ("workspace_id","family") WHERE deleted_at is null;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_oauth_app_ws_fk" FOREIGN KEY ("oauth_app_id","workspace_id") REFERENCES "public"."workspace_oauth_app"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connection_oauth_app_idx" ON "connection" USING btree ("oauth_app_id");--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_oauth_app_ck" CHECK ((oauth_app_source is null and oauth_app_id is null) or (oauth_app_source = 'platform' and oauth_app_id is null and oauth_client_id is not null) or (oauth_app_source = 'workspace' and oauth_app_id is not null and oauth_client_id is not null));--> statement-breakpoint
-- Crypto v2: rows written before v2 (v1, no AAD) are the ONLY rows allowed to hold v1 until rewrapped (scripts/admin/rewrap.mts).
UPDATE "connection" SET "legacy_crypto" = true WHERE "secret_enc" LIKE 'v1.%';--> statement-breakpoint
UPDATE "webhook_endpoint" SET "legacy_crypto" = true WHERE "secret_enc" LIKE 'v1.%';--> statement-breakpoint
UPDATE "sso_config" SET "legacy_crypto" = true WHERE "client_secret_enc" LIKE 'v1.%';--> statement-breakpoint
UPDATE "run_step" SET "data_legacy" = true WHERE "data_enc" IS NOT NULL AND "data_enc"->>'ciphertext' LIKE 'v1.%';--> statement-breakpoint
-- Pending OAuth/SSO authorizations (<= 10 minutes) change format (hashed state, v2 PKCE verifier): start them again.
DELETE FROM "oauth_state";--> statement-breakpoint
DELETE FROM "sso_state";
