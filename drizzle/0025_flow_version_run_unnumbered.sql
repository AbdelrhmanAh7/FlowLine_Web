-- Drop NOT NULL constraint on version column to allow NULL for run snapshots.
ALTER TABLE "flow_version" ALTER COLUMN "version" DROP NOT NULL;

-- Backfill: set version to NULL for existing "run" snapshots (rows created before this migration).
-- These rows kept their numbers because they were inserted before we started tracking run snapshots separately.
UPDATE "flow_version" SET "version" = NULL WHERE "reason" = 'run';