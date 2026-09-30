ALTER TABLE "agent_version" ADD COLUMN "route" jsonb;--> statement-breakpoint
ALTER TABLE "ai_attempt" ADD COLUMN "possible_charge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_attempt" ADD COLUMN "route_reason" text;--> statement-breakpoint
ALTER TABLE "ai_attempt" ADD COLUMN "serving_provider" text;--> statement-breakpoint
CREATE INDEX "ai_attempt_conn_time_idx" ON "ai_attempt" USING btree ("connection_id","created_at");