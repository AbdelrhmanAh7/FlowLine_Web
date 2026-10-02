CREATE TABLE "cb_experiment_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"user_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cb_trial" ADD COLUMN "user_verdict" text;--> statement-breakpoint
ALTER TABLE "cb_trial" ADD COLUMN "user_verdict_reason" text;--> statement-breakpoint
ALTER TABLE "cb_trial" ADD COLUMN "user_verdict_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cb_trial" ADD COLUMN "user_verdict_by" text;--> statement-breakpoint
ALTER TABLE "cb_experiment_event" ADD CONSTRAINT "cb_experiment_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_experiment_event" ADD CONSTRAINT "cb_experiment_event_session_id_cb_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cb_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cb_experiment_event" ADD CONSTRAINT "cb_experiment_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cb_experiment_event_session_idx" ON "cb_experiment_event" USING btree ("session_id","at");--> statement-breakpoint
ALTER TABLE "cb_trial" ADD CONSTRAINT "cb_trial_user_verdict_by_user_id_fk" FOREIGN KEY ("user_verdict_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;