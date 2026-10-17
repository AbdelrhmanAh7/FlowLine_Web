CREATE TABLE "retained_file_counter" (
	"scope" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid,
	"total_bytes" bigint DEFAULT 0 NOT NULL,
	"file_count" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "retained_file_counter_scope" CHECK ("retained_file_counter"."scope" = coalesce("retained_file_counter"."workspace_id"::text, 'installation')),
	CONSTRAINT "retained_file_counter_nonnegative" CHECK ("retained_file_counter"."total_bytes" >= 0 and "retained_file_counter"."file_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "retained_file_counter" ADD CONSTRAINT "retained_file_counter_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- The migrator runs this entire migration in a transaction. Block file writes and
-- workspace cascades until the one-time backfill and trigger installation commit.
LOCK TABLE "workspace", "file_object" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
INSERT INTO "retained_file_counter" ("scope", "workspace_id", "total_bytes", "file_count")
SELECT 'installation', NULL::uuid, coalesce(sum(octet_length(data)), 0)::bigint, count(*)
FROM "file_object"
UNION ALL
SELECT workspace_id::text, workspace_id, sum(octet_length(data))::bigint, count(*)
FROM "file_object" GROUP BY workspace_id;
--> statement-breakpoint
CREATE FUNCTION retained_file_counter_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_bytes bigint := 0;
  new_bytes bigint := 0;
  old_count bigint := 0;
  new_count bigint := 0;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_bytes := octet_length(OLD.data);
    old_count := 1;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_bytes := octet_length(NEW.data);
    new_count := 1;
  END IF;

  -- Always lock/update the singleton first, matching admission's lock order.
  UPDATE retained_file_counter
  SET total_bytes = total_bytes + new_bytes - old_bytes,
      file_count = file_count + new_count - old_count
  WHERE scope = 'installation';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missing retained-file installation counter';
  END IF;

  IF TG_OP <> 'INSERT' THEN
    -- A workspace cascade may already have removed its counter via its FK.
    -- Never recreate that row; the installation total still must be decremented.
    UPDATE retained_file_counter
    SET total_bytes = total_bytes - old_bytes, file_count = file_count - 1
    WHERE scope = OLD.workspace_id::text;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    INSERT INTO retained_file_counter (scope, workspace_id, total_bytes, file_count)
    VALUES (NEW.workspace_id::text, NEW.workspace_id, new_bytes, 1)
    ON CONFLICT (scope) DO UPDATE
    SET total_bytes = retained_file_counter.total_bytes + EXCLUDED.total_bytes,
        file_count = retained_file_counter.file_count + 1;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER retained_file_counter_change
AFTER INSERT OR DELETE OR UPDATE OF data, workspace_id ON "file_object"
FOR EACH ROW EXECUTE FUNCTION retained_file_counter_change();
