-- #117: "run" snapshots no longer take a public version number. Existing ones keep their graph but lose the number,
-- so the next publication of an affected flow no longer counts them. The immutability trigger (0002) is lifted only
-- for the backfill statement (same transaction); no other column changes.
ALTER TABLE "flow_version" ALTER COLUMN "version" DROP NOT NULL;--> statement-breakpoint
DROP INDEX "flow_version_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "flow_version_unique" ON "flow_version" USING btree ("flow_id","version") WHERE "flow_version"."version" is not null;--> statement-breakpoint
ALTER TABLE "flow_version" DISABLE TRIGGER "flow_version_no_update";--> statement-breakpoint
UPDATE "flow_version" SET "version" = NULL WHERE "reason" = 'run' AND "version" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "flow_version" ENABLE TRIGGER "flow_version_no_update";
