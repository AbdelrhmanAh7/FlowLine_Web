-- A run snapshot pins its graph without a publication number (version NULL), so runs never move the next publication's
-- number. Run snapshots written before this migration keep their numbers; the backfill below nulls them.
ALTER TABLE "flow_version" ALTER COLUMN "version" DROP NOT NULL;--> statement-breakpoint
-- Backfill: legacy run snapshots (written before this migration) keep their numeric versions, which would make the
-- first publication after deployment vN+1 instead of v1. Null them out. The 0002 immutability trigger raises on
-- every UPDATE, so it is dropped for this statement and recreated immediately after.
DROP TRIGGER flow_version_no_update ON flow_version;--> statement-breakpoint
UPDATE "flow_version" SET "version" = NULL WHERE "reason" = 'run';--> statement-breakpoint
CREATE TRIGGER flow_version_no_update BEFORE UPDATE ON flow_version FOR EACH ROW EXECUTE FUNCTION flow_version_immutable();--> statement-breakpoint
-- History order: created_at is the transaction start time, so it can tie or run backwards across transactions.
-- New rows take seq in insertion order. Existing rows are numbered in table scan order, which is insertion order unless
-- a later insert reused space freed by deleted rows.
ALTER TABLE "flow_version" ADD COLUMN "seq" bigserial NOT NULL;
