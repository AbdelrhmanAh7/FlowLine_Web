ALTER TABLE "ai_connection" ADD COLUMN "key_check_method" text;--> statement-breakpoint
ALTER TABLE "ai_connection" ADD COLUMN "key_checked_cred_version" integer;--> statement-breakpoint
ALTER TABLE "ai_model" ADD COLUMN "observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usage_event" ADD COLUMN "holder" text;--> statement-breakpoint
ALTER TABLE "usage_event" ADD COLUMN "abandoned_at" timestamp with time zone;