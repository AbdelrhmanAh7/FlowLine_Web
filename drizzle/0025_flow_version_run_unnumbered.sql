-- A run snapshot pins its graph without a publication number (version NULL), so runs never move the next publication's
-- number. Only "publish" rows get a version number. Legacy non-publish rows are nulled out and publish rows are renumbered.
ALTER TABLE "flow_version" ALTER COLUMN "version" DROP NOT NULL;--> statement-breakpoint
-- Backfill: legacy non-publish snapshots (save/run/overwrite) keep their numeric versions, which would make the
-- first publication after deployment vN+1 instead of v1. Null them out. The 0002 immutability trigger raises on
-- every UPDATE, so it is dropped for this statement and recreated immediately after.
DROP TRIGGER flow_version_no_update ON flow_version;--> statement-breakpoint
UPDATE "flow_version" SET "version" = NULL WHERE "reason" <> 'publish';--> statement-breakpoint
-- Renumber publish rows per flow in insertion order (created_at, id).
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY flow_id ORDER BY created_at, id) AS new_version
  FROM flow_version
  WHERE reason = 'publish'
)
UPDATE flow_version fv
SET version = n.new_version
FROM numbered n
WHERE fv.id = n.id;--> statement-breakpoint
CREATE TRIGGER flow_version_no_update BEFORE UPDATE ON flow_version FOR EACH ROW EXECUTE FUNCTION flow_version_immutable();