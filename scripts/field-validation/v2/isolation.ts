import { createHash } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SHARED_PORTS = new Set(["3000", "3100", "3200"]);
const FIELD_DB = /^flowline_test_field(?:_[a-z0-9]+)*$/;
export const fieldDatabaseDigest = (name: string) => createHash("sha256").update(name).digest("hex");
function parse(value: string | undefined, label: string) {
  try {
    if (!value) throw new Error();
    return new URL(value);
  } catch {
    throw new Error(`Invalid ${label} configuration`); // Never expose a database URL in an exception.
  }
}
export function fieldTarget(value: string | undefined) {
  const target = parse(value, "field API");
  if (!LOOPBACK.has(target.hostname) || !["http:", "https:"].includes(target.protocol) || !target.port || SHARED_PORTS.has(target.port) || target.username || target.password || target.search || target.hash || target.pathname !== "/") {
    throw new Error("Field API suite requires a loopback URL with a dedicated non-shared port");
  }
  return target;
}
export function assertFieldDatabase(value: string | undefined, environment: string | undefined) {
  const target = parse(value, "field database");
  if (environment !== "test" || !LOOPBACK.has(target.hostname) || !["postgres:", "postgresql:"].includes(target.protocol) || target.search || target.hash || !FIELD_DB.test(target.pathname.slice(1))) {
    throw new Error("Field suite requires a local isolated flowline_test_field database and FLOWLINE_ENV=test");
  }
  return target.pathname.slice(1);
}

/** Read-only identity check; callers must invoke before signup or any other API write. */
export async function preflightFieldIdentity(request: Pick<APIRequestContext, "get">, observerDatabase: string, expectedDatabase: string) {
  if (observerDatabase !== expectedDatabase) throw new Error("Field observer database identity mismatch");
  let response: Awaited<ReturnType<APIRequestContext["get"]>>;
  try { response = await request.get("/api/test/field-identity"); }
  catch { throw new Error("Field API identity preflight unavailable"); }
  if (!response.ok()) throw new Error("Field API identity preflight refused");
  let identity: unknown;
  try { identity = await response.json(); } catch { throw new Error("Field API identity preflight invalid"); }
  if (!identity || typeof identity !== "object" || (identity as { fieldDatabaseSha256?: unknown }).fieldDatabaseSha256 !== fieldDatabaseDigest(expectedDatabase)) {
    throw new Error("Field API database identity mismatch");
  }
}
