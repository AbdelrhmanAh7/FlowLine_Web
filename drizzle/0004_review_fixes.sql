ALTER TABLE "run_step" ADD COLUMN "data_enc" jsonb;--> statement-breakpoint
ALTER TABLE "webhook_event" ADD COLUMN "signature" text;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_event_signature_unique" ON "webhook_event" USING btree ("endpoint_id","signature");