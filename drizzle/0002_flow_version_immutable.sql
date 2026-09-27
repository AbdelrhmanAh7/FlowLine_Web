-- Published/pinned versions are immutable: runs reference them as their exact graph.
CREATE OR REPLACE FUNCTION flow_version_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'flow_version rows are immutable (id %)', OLD.id USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS flow_version_no_update ON flow_version;
--> statement-breakpoint
CREATE TRIGGER flow_version_no_update BEFORE UPDATE ON flow_version FOR EACH ROW EXECUTE FUNCTION flow_version_immutable();
