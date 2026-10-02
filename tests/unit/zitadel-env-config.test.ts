import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import testStackEnv from "../../scripts/test-stack.cjs";

vi.mock("@/server/platform-settings", () => ({ getSetting: vi.fn() }));
vi.mock("@/server/platform-secrets", () => ({ resolvePlatformCredential: vi.fn() }));

import { getSetting } from "@/server/platform-settings";
import { resolvePlatformCredential } from "@/server/platform-secrets";
import { activeZitadelConfig } from "@/server/zitadel-config";
import { readEnvZitadelConfig } from "@/server/zitadel-env";

const envKeys = ["ZITADEL_ISSUER", "ZITADEL_CLIENT_ID", "ZITADEL_CLIENT_SECRET"] as const;
const previousEnv = new Map<string, string | undefined>();
const issuer = "https://example.zitadel.cloud";

function setEnv(overrides: Partial<Record<(typeof envKeys)[number], string>>) {
  for (const key of envKeys) {
    const value = overrides[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => {
  previousEnv.clear();
  previousEnv.set("FLOWLINE_ENV", process.env.FLOWLINE_ENV);
  for (const key of envKeys) previousEnv.set(key, process.env[key]);
  process.env.FLOWLINE_ENV = "development";
  setEnv({});
  vi.mocked(getSetting).mockReset();
  vi.mocked(resolvePlatformCredential).mockReset();
});

afterEach(() => {
  for (const [key, value] of previousEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("operator ZITADEL environment configuration", () => {
  it("uses a complete valid environment tuple and changes its private cache fingerprint when only the secret rotates", async () => {
    setEnv({ ZITADEL_ISSUER: issuer, ZITADEL_CLIENT_ID: "1234@tenant", ZITADEL_CLIENT_SECRET: "local-client-secret-one" });
    const first = await activeZitadelConfig();
    setEnv({ ZITADEL_ISSUER: issuer, ZITADEL_CLIENT_ID: "1234@tenant", ZITADEL_CLIENT_SECRET: "local-client-secret-two" });
    const rotated = await activeZitadelConfig();

    expect(first).toMatchObject({ source: "environment", issuer, clientId: "1234@tenant" });
    expect(rotated).toMatchObject({ id: first!.id, revision: first!.revision });
    expect(rotated!.secretFingerprint).not.toBe(first!.secretFingerprint);
    expect(getSetting).not.toHaveBeenCalled();
    expect(resolvePlatformCredential).not.toHaveBeenCalled();
  });

  it("rekeys the internal Better Auth snapshot after a secret-only env rotation without exposing the secret in the key", async () => {
    const oldDatabaseUrl = process.env.DATABASE_URL;
    const oldAuthUrl = process.env.BETTER_AUTH_URL;
    process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5433/flowline_test";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    try {
      setEnv({ ZITADEL_ISSUER: issuer, ZITADEL_CLIENT_ID: "1234@tenant", ZITADEL_CLIENT_SECRET: "local-client-secret-one" });
      const { currentSnapshot } = await import("@/server/auth-dispatch");
      const first = await currentSnapshot();
      setEnv({ ZITADEL_ISSUER: issuer, ZITADEL_CLIENT_ID: "1234@tenant", ZITADEL_CLIENT_SECRET: "local-client-secret-two" });
      const rotated = await currentSnapshot();

      expect(first.zitadel).toMatchObject({ issuer, clientId: "1234@tenant" });
      expect(first.key).not.toBe(rotated.key);
      expect(first.key).not.toContain("local-client-secret-one");
      expect(rotated.key).not.toContain("local-client-secret-two");
    } finally {
      if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = oldDatabaseUrl;
      if (oldAuthUrl === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = oldAuthUrl;
    }
  });

  it("fails closed for a partial or malformed tuple instead of falling back to the DB source", async () => {
    setEnv({ ZITADEL_ISSUER: issuer, ZITADEL_CLIENT_ID: "1234@tenant" });
    expect(readEnvZitadelConfig()).toEqual({ status: "partial" });
    await expect(activeZitadelConfig()).resolves.toBeNull();

    setEnv({ ZITADEL_ISSUER: `${issuer}/path`, ZITADEL_CLIENT_ID: "1234@tenant", ZITADEL_CLIENT_SECRET: "local-client-secret" });
    expect(readEnvZitadelConfig()).toEqual({ status: "invalid" });
    await expect(activeZitadelConfig()).resolves.toBeNull();
    expect(getSetting).not.toHaveBeenCalled();
    expect(resolvePlatformCredential).not.toHaveBeenCalled();
  });

  it("uses the existing encrypted DB source only when all environment variables are absent", async () => {
    vi.mocked(getSetting).mockResolvedValue({ value: issuer, revision: 4, setAt: new Date(), setBy: "operator" } as never);
    vi.mocked(resolvePlatformCredential).mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001", publicId: "1234@tenant", secret: "legacy-db-secret", revision: 7 } as never);

    await expect(activeZitadelConfig()).resolves.toMatchObject({ source: "database", issuer, issuerRevision: 4, revision: 7 });
    expect(getSetting).toHaveBeenCalledOnce();
    expect(resolvePlatformCredential).toHaveBeenCalledOnce();
  });

  it("clears the operator environment tuple before any test stack starts", () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      FLOWLINE_ENV: "test",
      DATABASE_URL: "postgres://test:test@127.0.0.1:5433/flowline_test",
      ZITADEL_ISSUER: issuer,
      ZITADEL_CLIENT_ID: "1234@tenant",
      ZITADEL_CLIENT_SECRET: "must-not-enter-test-stack",
    };
    testStackEnv.applyTestStackEnv(env);
    expect(env).toMatchObject({ ZITADEL_ISSUER: "", ZITADEL_CLIENT_ID: "", ZITADEL_CLIENT_SECRET: "" });
  });
});
