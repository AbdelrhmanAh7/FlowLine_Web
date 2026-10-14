<<<<<<< HEAD
-- #117: "run" snapshots no longer take a public version number. Existing ones keep their graph but lose the number,
-- so the next publication of an affected flow no longer counts them. The immutability trigger (0002) is lifted only
-- for the backfill statement (same transaction); no other column changes.
ALTER TABLE "flow_version" ALTER COLUMN "version" DROP NOT NULL;--> statement-breakpoint
DROP INDEX "flow_version_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "flow_version_unique" ON "flow_version" USING btree ("flow_id","version") WHERE "flow_version"."version" is not null;--> statement-breakpoint
ALTER TABLE "flow_version" DISABLE TRIGGER "flow_version_no_update";--> statement-breakpoint
UPDATE "flow_version" SET "version" = NULL WHERE "reason" = 'run' AND "version" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "flow_version" ENABLE TRIGGER "flow_version_no_update";
=======
-- Only a publication carries a version number; save, overwrite and run snapshots are stored with version NULL, so
-- nothing but publishing moves a flow's next publication number. The backfill below nulls the numbers non-publication
-- snapshots took before this migration; published numbers (and the subflow steps that pin them) are kept as they are.
ALTER TABLE "flow_version" ALTER COLUMN "version" DROP NOT NULL;--> statement-breakpoint
-- The 0002 immutability trigger raises on every UPDATE, so it is dropped for this statement and recreated right after
-- (drizzle runs a migration in one transaction).
DROP TRIGGER flow_version_no_update ON flow_version;--> statement-breakpoint
UPDATE "flow_version" SET "version" = NULL WHERE "reason" <> 'publish';--> statement-breakpoint
CREATE TRIGGER flow_version_no_update BEFORE UPDATE ON flow_version FOR EACH ROW EXECUTE FUNCTION flow_version_immutable();
>>>>>>> origin/main
