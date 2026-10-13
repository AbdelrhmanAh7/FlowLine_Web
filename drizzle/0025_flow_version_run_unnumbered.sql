-- A run snapshot pins its graph without a publication number (version NULL), so runs never move the next publication's
-- number. The backfill below also nulls the numbers that run snapshots took before this migration.
ALTER TABLE "flow_version" ALTER COLUMN "version" DROP NOT NULL;--> statement-breakpoint
-- Backfill: a numbered legacy run snapshot would make the first publication after deployment vN+1 instead of v1.
-- The 0002 immutability trigger raises on every UPDATE, so it is dropped for this statement and recreated right after
-- (drizzle runs a migration in one transaction).
DROP TRIGGER flow_version_no_update ON flow_version;--> statement-breakpoint
UPDATE "flow_version" SET "version" = NULL WHERE "reason" = 'run';--> statement-breakpoint
CREATE TRIGGER flow_version_no_update BEFORE UPDATE ON flow_version FOR EACH ROW EXECUTE FUNCTION flow_version_immutable();
