ALTER TABLE "connection" ADD COLUMN "oauth_app_epoch" integer;--> statement-breakpoint
ALTER TABLE "signin_attempt" ADD COLUMN "secret_id" uuid;