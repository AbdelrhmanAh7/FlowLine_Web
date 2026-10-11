DROP INDEX "flow_version_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "flow_version_unique" ON "flow_version" USING btree ("flow_id","version") WHERE "flow_version"."version" is not null;