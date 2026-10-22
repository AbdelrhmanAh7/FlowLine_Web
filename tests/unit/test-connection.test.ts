import { beforeEach, describe, expect, it, vi } from "vitest";
import { testConnection } from "@/server/connection-test";
import { HttpError } from "@/server/http";
import type { CurrentUser } from "@/server/access";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  requireWorkspace: vi.fn(),
  openSecret: vi.fn(),
  runConnectionTest: vi.fn(),
  getProvider: vi.fn(),
}));

vi.mock("@/db", async () => ({
  db: { select: mocks.select },
  schema: await import("@/db/schema"),
}));

vi.mock("@/server/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/access")>();
  return {
    ...actual,
    requireWorkspace: mocks.requireWorkspace,
  };
});

vi.mock("@/server/crypto", () => ({
  openSecret: mocks.openSecret,
}));

vi.mock("@/integrations/connection-test", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/integrations/connection-test")>();
  return {
    ...actual,
    runConnectionTest: mocks.runConnectionTest,
  };
});

vi.mock("@/integrations/registry", () => ({
  getProvider: mocks.getProvider,
}));

const USER: CurrentUser = { id: "user-1", email: "user@example.test", name: "Alice" };
const WS_ID = "11111111-1111-4111-8111-111111111111";
const CONN_ID = "22222222-2222-4222-8222-222222222222";

describe("testConnection (server)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspace.mockResolvedValue({ workspace: { id: WS_ID, slug: "test-ws" } });
    mocks.getProvider.mockReturnValue({ id: "mizano", name: "Mizano", authType: "api_key" });
    mocks.openSecret.mockReturnValue({ token: "secret-token", settings: { baseUrl: "https://mizano.example.com" } });
    mocks.runConnectionTest.mockResolvedValue("Alice A Mizano");
  });

  function mockDbConn(conn: Record<string, unknown> | null) {
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => (conn ? [conn] : []),
      }),
    });
  }

  it("succeeds for workspace owner/editor and returns account label without echoing secret", async () => {
    mockDbConn({
      id: CONN_ID,
      workspaceId: WS_ID,
      provider: "mizano",
      visibility: "workspace",
      createdBy: "user-2",
      secretEnc: "encrypted",
      keyId: "k1",
      legacyCrypto: false,
    });

    const res = await testConnection(USER, WS_ID, CONN_ID);
    expect(res).toEqual({ ok: true, provider: "Mizano", accountLabel: "Alice A Mizano" });
    expect(JSON.stringify(res)).not.toContain("secret-token");
    expect(mocks.requireWorkspace).toHaveBeenCalledWith(USER, WS_ID, "integration.manage");
  });

  it("rejects a non-uuid connection id with 404", async () => {
    await expect(testConnection(USER, WS_ID, "not-a-uuid")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("returns 404 CONNECTION_NOT_FOUND when connection does not exist", async () => {
    mockDbConn(null);
    await expect(testConnection(USER, WS_ID, CONN_ID)).rejects.toMatchObject({
      status: 404,
      code: "CONNECTION_NOT_FOUND",
    });
  });

  it("returns 403 NOT_CONNECTION_OWNER if private connection was created by another user", async () => {
    mockDbConn({
      id: CONN_ID,
      workspaceId: WS_ID,
      provider: "mizano",
      visibility: "private",
      createdBy: "other-user",
      secretEnc: "encrypted",
      keyId: "k1",
      legacyCrypto: false,
    });

    await expect(testConnection(USER, WS_ID, CONN_ID)).rejects.toMatchObject({
      status: 403,
      code: "NOT_CONNECTION_OWNER",
    });
  });

  it("allows creator to test their own private connection", async () => {
    mockDbConn({
      id: CONN_ID,
      workspaceId: WS_ID,
      provider: "mizano",
      visibility: "private",
      createdBy: USER.id,
      secretEnc: "encrypted",
      keyId: "k1",
      legacyCrypto: false,
    });

    const res = await testConnection(USER, WS_ID, CONN_ID);
    expect(res).toEqual({ ok: true, provider: "Mizano", accountLabel: "Alice A Mizano" });
  });

  it("returns 400 TEST_NOT_SUPPORTED for OAuth providers", async () => {
    mockDbConn({
      id: CONN_ID,
      workspaceId: WS_ID,
      provider: "slack",
      visibility: "workspace",
      createdBy: USER.id,
      secretEnc: "encrypted",
      keyId: "k1",
      legacyCrypto: false,
    });
    mocks.getProvider.mockReturnValue({ id: "slack", name: "Slack", authType: "oauth2" });

    await expect(testConnection(USER, WS_ID, CONN_ID)).rejects.toMatchObject({
      status: 400,
      code: "TEST_NOT_SUPPORTED",
    });
    expect(mocks.openSecret).not.toHaveBeenCalled();
  });

  it("returns 404 UNKNOWN_PROVIDER if provider is not in registry", async () => {
    mockDbConn({
      id: CONN_ID,
      workspaceId: WS_ID,
      provider: "unknown-provider",
      visibility: "workspace",
      createdBy: USER.id,
      secretEnc: "encrypted",
      keyId: "k1",
      legacyCrypto: false,
    });
    mocks.getProvider.mockReturnValue(undefined);

    await expect(testConnection(USER, WS_ID, CONN_ID)).rejects.toMatchObject({
      status: 404,
      code: "UNKNOWN_PROVIDER",
    });
  });

  it("forwards permission errors from requireWorkspace (403 for viewer, 404 for stranger)", async () => {
    mocks.requireWorkspace.mockRejectedValue(new HttpError(403, "FORBIDDEN", "Forbidden"));
    await expect(testConnection(USER, WS_ID, CONN_ID)).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
  });
});
