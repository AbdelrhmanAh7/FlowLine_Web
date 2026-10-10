import { createHash } from "node:crypto";

const FIELD_DB = /^flowline_test_field(?:_[a-z0-9]+)*$/;

/** Test-only, read-only identity. Never returns a database name or connection string. */
export async function fieldValidationIdentity(environment: string | undefined, currentDatabase: () => Promise<unknown>) {
  if (environment !== "test") return null;
  const name = await currentDatabase();
  if (typeof name !== "string" || !FIELD_DB.test(name)) return null;
  return createHash("sha256").update(name).digest("hex");
}
