-- #205 (P1 thread from PR #139): only a publication may hold a public version number (#204), or the next publication of
-- the flow skips past the numbers that save, run and overwrite snapshots took. #204's 0025 nulls the numbers present when
-- it runs, without a backup. Numbered snapshots can still appear afterwards: the previous image (the supported rollback)
-- numbers every save, run and overwrite it inserts. This clears them too. Idempotent: a second run leaves the same state.
-- Reversible: the old numbers are kept in flow_version_number_backup, and drizzle/reverse/0026_flow_version_run_backfill.sql
-- puts them back. drizzle's migrator runs this file in one transaction, so the immutability trigger (0002) is off only for
-- the UPDATE and a failure rolls everything back.
CREATE TABLE IF NOT EXISTS "flow_version_number_backup" (
	"flow_version_id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"backed_up_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_version_number_backup_flow_version_id_flow_version_id_fk" FOREIGN KEY ("flow_version_id") REFERENCES "public"."flow_version"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
-- Keep the first number seen: a re-run (also after a reverse) never overwrites the original backup.
INSERT INTO "flow_version_number_backup" ("flow_version_id", "version")
SELECT "id", "version" FROM "flow_version" WHERE "reason" <> 'publish' AND "version" IS NOT NULL
ON CONFLICT ("flow_version_id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "flow_version" DISABLE TRIGGER "flow_version_no_update";
--> statement-breakpoint
UPDATE "flow_version" SET "version" = NULL WHERE "reason" <> 'publish' AND "version" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "flow_version" ENABLE TRIGGER "flow_version_no_update";
--> statement-breakpoint
-- Rollback safety: the previous image (the supported rollback, see DESIGN_DECISIONS.md) still numbers the save, run and
-- overwrite snapshots it inserts, and this one-time UPDATE never runs again. Keep them unnumbered at the database instead.
CREATE OR REPLACE FUNCTION flow_version_unpublished_unnumbered() RETURNS trigger AS $$
BEGIN
  NEW.version := NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS flow_version_unpublished_unnumbered ON flow_version;
--> statement-breakpoint
CREATE TRIGGER flow_version_unpublished_unnumbered BEFORE INSERT ON flow_version FOR EACH ROW WHEN (NEW.reason <> 'publish') EXECUTE FUNCTION flow_version_unpublished_unnumbered();
