/**
 * Explicit child environment for the local focused-run evidence helpers (issue #36).
 *
 * The helpers under `artifacts/phase-4/**` start a Vitest child against a disposable `flowline_test*` database. They
 * used to build its environment as `{ ...process.env, ...synthetic }`, so any ambient shell variable (another
 * FLOWLINE_* setting, a provider key, a database URL, NODE_OPTIONS ...) could change what an evidence run proved.
 *
 * The child now receives only:
 *   1. the minimal OS/runtime variables listed below, and only when the parent actually has them, and
 *   2. the variables the helper constructs itself (DATABASE_URL, FLOWLINE_ENV=test and its synthetic test settings).
 * Everything else is dropped. The returned record lists variable NAMES only, never values, so a helper can store it in
 * its result JSON (or print it) without leaking a credential.
 *
 * Why these names (the child is `node vitest.mjs`; its global setup runs `npx tsx ...` through the platform shell):
 *   - PATH, PATHEXT, COMSPEC, SYSTEMROOT, SYSTEMDRIVE, WINDIR: command and shell resolution and Windows system calls.
 *   - TEMP, TMP, TMPDIR: where Node, Vite and esbuild write scratch files.
 *   - HOME, USERPROFILE, APPDATA, LOCALAPPDATA: npm/npx user configuration and cache locations.
 *   - NODE_OPTIONS: forwarded verbatim only when set (laptop runs often raise `--max-old-space-size`). Unlike the rest it
 *     can change runtime behaviour (`--require`), so a run that must be pristine should start from a shell without it;
 *     its presence is visible in `inheritedNames`.
 * Timezone, locale, NODE_ENV, CI and npm_config_* are deliberately not forwarded so a run does not depend on them.
 */

const COMMON = ["PATH", "HOME", "TEMP", "TMP", "NODE_OPTIONS"];
const POSIX = ["TMPDIR"];
const WIN32 = ["PATHEXT", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "USERPROFILE", "APPDATA", "LOCALAPPDATA"];

/** Database names a focused run may target: `flowline_test` or `flowline_test_<suffix>`, never the development database. */
const TEST_DATABASE = /^flowline_test(?:_[a-z0-9]+)?$/;

/** Sorted, de-duplicated names the child may inherit from the parent environment on `platform`. */
export function allowlistFor(platform = process.platform) {
  return [...new Set([...COMMON, ...(platform === "win32" ? WIN32 : POSIX)])].sort();
}

function assertTestEnvironment(explicit) {
  if (explicit.FLOWLINE_ENV !== "test") throw new Error("Focused runs must set FLOWLINE_ENV=test");
  let database;
  try {
    database = decodeURIComponent(new URL(explicit.DATABASE_URL ?? "").pathname.replace(/^\//, ""));
  } catch {
    // The message never includes the URL: it may carry a credential.
    throw new Error("DATABASE_URL is missing or not a valid URL");
  }
  if (!TEST_DATABASE.test(database)) throw new Error("DATABASE_URL must target flowline_test or flowline_test_<suffix>");
}

/**
 * Builds the child environment for a focused test run.
 *
 * @param parentEnv ambient environment (normally `process.env`); only allowlisted names are read from it
 * @param explicit variables the helper constructs itself; must include DATABASE_URL (a flowline_test* database) and
 *   FLOWLINE_ENV=test. An `undefined` value is skipped; any other non-string value throws.
 * @param options.platform selects the allowlist and, on win32, case-insensitive name matching (default: this process)
 * @returns `env` for `spawn`, and a names-only `record` for the result JSON
 */
export function buildFocusedTestEnv(parentEnv, explicit, { platform = process.platform } = {}) {
  assertTestEnvironment(explicit);
  // Windows variable names are case-insensitive (`Path`, `SystemRoot`): match folded names, keep the parent's casing.
  const fold = platform === "win32" ? (name) => name.toUpperCase() : (name) => name;
  const allowed = new Set(allowlistFor(platform).map(fold));
  const env = {};
  const seen = new Set();
  let ambientCount = 0;
  for (const [name, value] of Object.entries(parentEnv)) {
    if (typeof value !== "string") continue;
    ambientCount++;
    if (!allowed.has(fold(name)) || seen.has(fold(name))) continue;
    seen.add(fold(name));
    env[name] = value;
  }
  const explicitNames = [];
  for (const [name, value] of Object.entries(explicit)) {
    if (value === undefined) continue;
    if (typeof value !== "string") throw new TypeError(`Explicit environment variable ${name} must be a string`);
    for (const existing of Object.keys(env)) if (existing !== name && fold(existing) === fold(name)) delete env[existing];
    env[name] = value;
    explicitNames.push(name);
  }
  const explicitFolded = new Set(explicitNames.map(fold));
  const inheritedNames = Object.keys(env).filter((name) => !explicitFolded.has(fold(name))).sort();
  return {
    env,
    record: {
      policy: "allowlist",
      platform,
      allowlist: allowlistFor(platform),
      inheritedNames,
      explicitNames: explicitNames.sort(),
      ambientVariablesNotForwarded: ambientCount - inheritedNames.length,
    },
  };
}
