-- Reverse of 0026_flow_version_run_backfill (#205). Not in the drizzle journal: run it by hand, in one transaction
-- (psql --single-transaction -f), only when the backfill has to be undone. Puts back the numbers that pre-#204 run
-- snapshots held. Idempotent: only snapshots that are still unnumbered are touched. If a later save or publication
-- has taken a freed number, the unique index flow_version_unique refuses and the whole transaction rolls back.
-- The backup table stays, so the backfill can run again afterwards.
ALTER TABLE "flow_version" DISABLE TRIGGER "flow_version_no_update";
--> statement-breakpoint
UPDATE "flow_version" AS v SET "version" = b."version"
FROM "flow_version_run_number_backup" AS b
WHERE v."id" = b."flow_version_id" AND v."reason" = 'run' AND v."version" IS NULL;
--> statement-breakpoint
ALTER TABLE "flow_version" ENABLE TRIGGER "flow_version_no_update";
