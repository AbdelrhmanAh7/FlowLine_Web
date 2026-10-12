-- Reverse of 0026_flow_version_run_backfill (#205). Not in the drizzle journal: run it by hand, in one transaction and
-- stopping at the first error, only when the backfill has to be undone:
--   psql -v ON_ERROR_STOP=1 --single-transaction -f drizzle/reverse/0026_flow_version_run_backfill.sql
-- (without ON_ERROR_STOP, psql keeps going after an error and can still exit 0). Drops the trigger that keeps run
-- snapshots unnumbered and puts back the numbers that pre-#204 run snapshots held. Idempotent: only snapshots that are
-- still unnumbered are touched. If a later save or publication has taken a freed number, the unique index
-- flow_version_unique refuses and the whole transaction rolls back. The backup table stays, so the backfill can run again.
DROP TRIGGER IF EXISTS flow_version_run_unnumbered ON flow_version;
--> statement-breakpoint
DROP FUNCTION IF EXISTS flow_version_run_unnumbered();
--> statement-breakpoint
ALTER TABLE "flow_version" DISABLE TRIGGER "flow_version_no_update";
--> statement-breakpoint
UPDATE "flow_version" AS v SET "version" = b."version"
FROM "flow_version_run_number_backup" AS b
WHERE v."id" = b."flow_version_id" AND v."reason" = 'run' AND v."version" IS NULL;
--> statement-breakpoint
ALTER TABLE "flow_version" ENABLE TRIGGER "flow_version_no_update";
