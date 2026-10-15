-- Only a publication carries a version number; save, overwrite and run snapshots are stored with version NULL, so
-- nothing but publishing moves a flow's next publication number. The backfill below nulls the numbers non-publication
-- snapshots took before this migration; published numbers (and the subflow steps that pin them) are kept as they are.
ALTER TABLE "flow_version" ALTER COLUMN "version" DROP NOT NULL;--> statement-breakpoint
-- The 0002 immutability trigger raises on every UPDATE, so it is dropped for this statement and recreated right after
-- (drizzle runs a migration in one transaction).
DROP TRIGGER flow_version_no_update ON flow_version;--> statement-breakpoint
UPDATE "flow_version" SET "version" = NULL WHERE "reason" <> 'publish';--> statement-breakpoint
CREATE TRIGGER flow_version_no_update BEFORE UPDATE ON flow_version FOR EACH ROW EXECUTE FUNCTION flow_version_immutable();
