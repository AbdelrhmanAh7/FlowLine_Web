-- #117: "run" snapshots no longer take a public version number. Existing ones keep their graph but lose the number,
-- so the next publication of an affected flow no longer counts them. The immutability trigger (0002) is lifted only
-- for this statement (same transaction); no other column changes.
ALTER TABLE "flow_version" DISABLE TRIGGER "flow_version_no_update";--> statement-breakpoint
UPDATE "flow_version" SET "version" = NULL WHERE "reason" = 'run' AND "version" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "flow_version" ENABLE TRIGGER "flow_version_no_update";
