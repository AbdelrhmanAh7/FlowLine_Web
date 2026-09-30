CREATE TABLE "product_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"workspace_id" uuid,
	"user_id" text,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"correlation_id" text
);
--> statement-breakpoint
CREATE INDEX "product_event_name_at_idx" ON "product_event" USING btree ("name","at");--> statement-breakpoint
CREATE INDEX "product_event_ws_idx" ON "product_event" USING btree ("workspace_id","at");