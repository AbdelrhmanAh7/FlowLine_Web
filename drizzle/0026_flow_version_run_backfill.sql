-- #205 (P1 thread from PR #139): run snapshots written before #204 still hold a public version number, so the next
-- publication of such a flow skips past them. This clears those numbers. Idempotent: a second run leaves the same
-- state. Reversible: the old numbers are kept in flow_version_run_number_backup, and
-- drizzle/reverse/0026_flow_version_run_backfill.sql puts them back. drizzle's migrator runs this file in one
-- transaction, so the immutability trigger (0002) is off only for the UPDATE and a failure rolls everything back.
CREATE TABLE IF NOT EXISTS "flow_version_run_number_backup" (
	"flow_version_id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"backed_up_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_version_run_number_backup_flow_version_id_flow_version_id_fk" FOREIGN KEY ("flow_version_id") REFERENCES "public"."flow_version"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
-- Keep the first number seen: a re-run (also after a reverse) never overwrites the original backup.
INSERT INTO "flow_version_run_number_backup" ("flow_version_id", "version")
SELECT "id", "version" FROM "flow_version" WHERE "reason" = 'run' AND "version" IS NOT NULL
ON CONFLICT ("flow_version_id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "flow_version" DISABLE TRIGGER "flow_version_no_update";
--> statement-breakpoint
UPDATE "flow_version" SET "version" = NULL WHERE "reason" = 'run' AND "version" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "flow_version" ENABLE TRIGGER "flow_version_no_update";
--> statement-breakpoint
-- Rollback safety: the previous image (the supported rollback, see DESIGN_DECISIONS.md) still numbers the run snapshots
-- it inserts, and this one-time UPDATE never runs again. Keep run snapshots unnumbered at the database instead.
CREATE OR REPLACE FUNCTION flow_version_run_unnumbered() RETURNS trigger AS $$
BEGIN
  NEW.version := NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS flow_version_run_unnumbered ON flow_version;
--> statement-breakpoint
CREATE TRIGGER flow_version_run_unnumbered BEFORE INSERT ON flow_version FOR EACH ROW WHEN (NEW.reason = 'run') EXECUTE FUNCTION flow_version_run_unnumbered();
