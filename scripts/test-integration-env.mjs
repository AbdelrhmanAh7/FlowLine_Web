/** Resolves and validates the test-only base environment used to derive integration shard database URLs. */
const TEST_DATABASE = /^flowline_test(?:_[a-z0-9]+)?$/;

export function resolveIntegrationBaseEnv(fileEnv, processEnv) {
  if (!fileEnv.DATABASE_URL) throw new Error(".env.test has no DATABASE_URL");
  if (fileEnv.FLOWLINE_ENV !== "test") throw new Error(".env.test must set FLOWLINE_ENV=test");

  const baseEnv = { ...fileEnv, ...processEnv };
  if (baseEnv.FLOWLINE_ENV !== "test") throw new Error("FLOWLINE_ENV must be test for integration shards");
  if (!baseEnv.DATABASE_URL) throw new Error("test DATABASE_URL is missing");

  let dbName;
  try {
    dbName = decodeURIComponent(new URL(baseEnv.DATABASE_URL).pathname.replace(/^\//, ""));
  } catch {
    throw new Error("DATABASE_URL is invalid for integration shards");
  }
  if (!TEST_DATABASE.test(dbName)) throw new Error("DATABASE_URL must target flowline_test or flowline_test_<suffix>");
  return baseEnv;
}
