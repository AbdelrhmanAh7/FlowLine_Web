import { fieldValidationIdentity } from "@/server/field-validation-identity";
import { json, notFound, route } from "@/server/http";

/** Read-only identity for the isolated field suite; never exposes the database name or URL. */
export const GET = route(async () => {
  if (process.env.FLOWLINE_ENV !== "test") throw notFound();
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
