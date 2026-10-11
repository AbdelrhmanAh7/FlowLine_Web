import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { allowlistFor, buildFocusedTestEnv } from "../../scripts/focused-run-env.mjs";

const explicit = {
  DATABASE_URL: "postgres://pilot:explicit-pw@127.0.0.1:5432/flowline_test_unit",
  FLOWLINE_ENV: "test",
  BETTER_AUTH_SECRET: "explicit-secret",
};

const windowsParent = {
  Path: "C:\\bin", SystemRoot: "C:\\Windows", ComSpec: "C:\\Windows\\System32\\cmd.exe", PATHEXT: ".EXE;.CMD", Temp: "C:\\t", TMP: "C:\\t",
  USERPROFILE: "C:\\Users\\dev", APPDATA: "C:\\Users\\dev\\AppData\\Roaming", LOCALAPPDATA: "C:\\Users\\dev\\AppData\\Local",
  // Ambient values that must never reach an evidence run.
  FLOWLINE_UPLOAD_WORKSPACE_MAX_BYTES: "1", DATABASE_URL: "postgres://ambient:ambient-pw@127.0.0.1:5432/flowline", ZITADEL_ISSUER: "https://ambient.example",
  NODE_ENV: "production", OPENAI_API_KEY: "sk-ambient-key", GOOGLE_OAUTH_CLIENT_ID: "ambient-google", CI: "true", TZ: "Asia/Tokyo",
};

describe("focused-run child environment", () => {
  it("pins the allowlist so widening it is a deliberate change", () => {
    expect(allowlistFor("linux")).toEqual(["HOME", "NODE_OPTIONS", "PATH", "TEMP", "TMP", "TMPDIR"]);
    expect(allowlistFor("win32")).toEqual([
      "APPDATA", "COMSPEC", "HOME", "LOCALAPPDATA", "NODE_OPTIONS", "PATH", "PATHEXT", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "TMP", "USERPROFILE", "WINDIR",
    ]);
  });

  it("on Windows forwards only allowlisted names (case-insensitive, parent casing kept) plus the explicit values", () => {
    const { env, record } = buildFocusedTestEnv(windowsParent, explicit, { platform: "win32" });
    expect(Object.keys(env).sort()).toEqual([
      "APPDATA", "BETTER_AUTH_SECRET", "ComSpec", "DATABASE_URL", "FLOWLINE_ENV", "LOCALAPPDATA", "PATHEXT", "Path", "SystemRoot", "TMP", "Temp", "USERPROFILE",
    ].sort());
    expect(env.DATABASE_URL).toBe(explicit.DATABASE_URL); // the constructed URL replaces the ambient one
    expect(env.FLOWLINE_ENV).toBe("test");
    expect(env.Path).toBe("C:\\bin");
    expect(record.inheritedNames).toEqual(["APPDATA", "ComSpec", "LOCALAPPDATA", "PATHEXT", "Path", "SystemRoot", "TMP", "Temp", "USERPROFILE"].sort());
    expect(record.explicitNames).toEqual(["BETTER_AUTH_SECRET", "DATABASE_URL", "FLOWLINE_ENV"]);
    expect(record.ambientVariablesNotForwarded).toBe(Object.keys(windowsParent).length - record.inheritedNames.length);
  });

  it("on Linux matches names exactly and ignores Windows-only variables", () => {
    const { env, record } = buildFocusedTestEnv({
      PATH: "/usr/bin", HOME: "/home/dev", TMPDIR: "/tmp",
      Path: "wrong-case", USERPROFILE: "C:\\ignored", SYSTEMROOT: "C:\\ignored", LANG: "ar_EG.UTF-8", TZ: "Asia/Tokyo", NODE_ENV: "production",
      ZITADEL_CLIENT_SECRET: "ambient-zitadel",
    }, explicit, { platform: "linux" });
    expect(Object.keys(env).sort()).toEqual(["BETTER_AUTH_SECRET", "DATABASE_URL", "FLOWLINE_ENV", "HOME", "PATH", "TMPDIR"]);
    expect(record.inheritedNames).toEqual(["HOME", "PATH", "TMPDIR"]);
    expect(record.platform).toBe("linux");
  });

  it("forwards NODE_OPTIONS only when it is set, and records the name", () => {
    expect(buildFocusedTestEnv({ PATH: "/bin" }, explicit, { platform: "linux" }).env).not.toHaveProperty("NODE_OPTIONS");
    const { env, record } = buildFocusedTestEnv({ PATH: "/bin", NODE_OPTIONS: "--max-old-space-size=2048" }, explicit, { platform: "linux" });
    expect(env.NODE_OPTIONS).toBe("--max-old-space-size=2048");
    expect(record.inheritedNames).toEqual(["NODE_OPTIONS", "PATH"]);
  });

  it("lets an explicit value replace an allowlisted variable of any case without listing it as inherited", () => {
    const { env, record } = buildFocusedTestEnv({ Temp: "C:\\ambient", Path: "C:\\bin" }, { ...explicit, TEMP: "C:\\explicit" }, { platform: "win32" });
    expect(env.TEMP).toBe("C:\\explicit");
    expect(env).not.toHaveProperty("Temp");
    expect(record.inheritedNames).toEqual(["Path"]);
    expect(record.explicitNames).toContain("TEMP");
  });

  it("skips undefined values and rejects other non-string values", () => {
    expect(buildFocusedTestEnv({}, { ...explicit, ZITADEL_ISSUER: undefined }, { platform: "linux" }).env).not.toHaveProperty("ZITADEL_ISSUER");
    expect(() => buildFocusedTestEnv({}, { ...explicit, FLOWLINE_DB_POOL_MAX: 4 as unknown as string }, { platform: "linux" })).toThrow(/FLOWLINE_DB_POOL_MAX must be a string/);
  });

  it("refuses anything but FLOWLINE_ENV=test and a flowline_test* database, without echoing the URL", () => {
    const run = (overrides: Record<string, string | undefined>) => buildFocusedTestEnv({}, { ...explicit, ...overrides }, { platform: "linux" });
    expect(() => run({ FLOWLINE_ENV: "development" })).toThrow(/FLOWLINE_ENV=test/);
    expect(() => run({ FLOWLINE_ENV: undefined })).toThrow(/FLOWLINE_ENV=test/);
    expect(() => run({ DATABASE_URL: undefined })).toThrow(/missing or not a valid URL/);
    expect(() => run({ DATABASE_URL: "not a url with secret-token" })).toThrow(/missing or not a valid URL/);
    for (const database of ["flowline", "flowline_prod", "flowline_testing-x", "flowline_test_"]) {
      let message = "";
      try { run({ DATABASE_URL: `postgres://owner:leaky-pw@db.example:5432/${database}` }); } catch (error) { message = String((error as Error).message); }
      expect(message).toMatch(/must target flowline_test/);
      expect(message).not.toContain("leaky-pw");
    }
    expect(() => run({ DATABASE_URL: "postgres://u:p@127.0.0.1:5432/flowline_test?sslmode=disable" })).not.toThrow();
  });

  it("records names only, never a value", () => {
    const { record } = buildFocusedTestEnv(windowsParent, explicit, { platform: "win32" });
    const text = JSON.stringify(record);
    for (const value of ["explicit-pw", "explicit-secret", "ambient-pw", "sk-ambient-key", "C:\\\\bin", "https://ambient.example"]) expect(text).not.toContain(value);
    expect(text).not.toContain("OPENAI_API_KEY"); // ambient names outside the allowlist are not recorded either
  });
});

const root = fileURLToPath(new URL("../../", import.meta.url));
const helpers = [
  "artifacts/phase-4/paid-pilot-round1/upload-admission/run-focused.mjs",
  "artifacts/phase-4/paid-pilot-round1/federated-mfa/run-focused.mjs",
  "artifacts/phase-4/paid-pilot-round1/run-auth-focused.mjs",
  "artifacts/phase-4/security-auth/run-focused.mjs",
];

describe.each(helpers)("focused-run helper %s", (script) => {
  it("does not spread the ambient environment into the test child", () => {
    expect(readFileSync(`${root}${script}`, "utf8")).not.toMatch(/\.\.\.process\.env/);
  });

  it("--dry-run prints the allowlisted child environment names without Docker, git or values", () => {
    const stdout = execFileSync(process.execPath, [script, "--dry-run"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        FLOWLINE_SENTINEL_AMBIENT: "sentinel-value", ZITADEL_ISSUER: "https://ambient.example", NODE_ENV: "production",
        // The two Vitest-only wrappers read the target database from the environment; the others construct their own.
        DATABASE_URL: "postgres://pilot:ambient-db-pw@127.0.0.1:5432/flowline_test_unit",
      },
    });
    const report = JSON.parse(stdout) as { dryRun: boolean; policy: string; allowlist: string[]; inheritedNames: string[]; explicitNames: string[] };
    expect(report.dryRun).toBe(true);
    expect(report.policy).toBe("allowlist");
    const fold = (n: string) => (process.platform === "win32" ? n.toUpperCase() : n);
    expect(report.inheritedNames.every((name) => report.allowlist.includes(fold(name)))).toBe(true);
    expect(report.inheritedNames).not.toContain("DATABASE_URL");
    expect(report.explicitNames).toEqual(expect.arrayContaining(["DATABASE_URL", "FLOWLINE_ENV", "BETTER_AUTH_SECRET"]));
    for (const leaked of ["FLOWLINE_SENTINEL_AMBIENT", "ZITADEL_ISSUER", "NODE_ENV"]) {
      expect(report.inheritedNames).not.toContain(leaked);
      expect(report.explicitNames).not.toContain(leaked);
    }
    for (const value of ["sentinel-value", "ambient.example", "ambient-db-pw"]) expect(stdout).not.toContain(value);
  });
});
