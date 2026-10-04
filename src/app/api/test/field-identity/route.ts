import { testFeaturesEnabled } from "@/server/faults";
import { fieldValidationIdentity } from "@/server/field-validation-identity";
import { json, notFound, route } from "@/server/http";

/**
 * TEST ENVIRONMENT ONLY — 404 everywhere else (same `testFeaturesEnabled()` gate as the other /api/test routes, and the
 * beta proxy blocks /api/test/*). Read-only identity for the isolated field-validation suite: a SHA-256 of the name of the
 * database THIS server is connected to, only when that name is a `flowline_test_field*` database. It never returns the
 * name or a connection string, and the database module is not even loaded outside the test environment.
 */
export const GET = route(async () => {
  if (!testFeaturesEnabled()) throw notFound();
  let fieldDatabaseSha256: string | null;
  try {
    fieldDatabaseSha256 = await fieldValidationIdentity(process.env.FLOWLINE_ENV, async () => {
      const { pool } = await import("@/db");
      const result = await pool.query<{ name: string }>("SELECT current_database() AS name");
      return result.rows[0]?.name;
    });
  } catch { throw notFound(); }
  if (!fieldDatabaseSha256) throw notFound();
  return json({ fieldDatabaseSha256 });
});
