import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

// Statement-ORDER check for the two SSO callback transactions in `completeSso` (src/server/sso.ts): the local-TOTP
// challenge branch and the direct sign-in branch. `confirmSsoLink` and `completeFederatedChallenge` are covered by
// federated-lock-order.test.ts; these two lock the user and sessions with their own queries, and a session-first order
// there would deadlock against the user-first password reset and link confirmation (issues #37, #41). The mocked database
// records every row lock in the order issued. It proves order only; PostgreSQL deadlocks run in CI. Rule:
// docs/security/FEDERATED_MFA.md, "Lock order".

const fx = vi.hoisted(() => {
  const far = new Date("2099-01-01");
  const updatedAt = new Date("2026-01-02");
  return {
    events: [] as string[],
    twoFactorEnabled: true,
    updatedAt,
    user: { id: "user-1", email: "user@example.test", emailVerified: true, twoFactorEnabled: true },
    session: { id: "session-new", token: "new-token", userId: "user-1", expiresAt: far },
    initiator: { id: "session-initiator", token: "initiator-token", userId: "user-1", expiresAt: far },
    config: { workspaceId: "ws-1", enabled: true, issuer: "https://idp.example", clientId: "client", clientSecretEnc: "x", keyId: "k", legacyCrypto: false, provider: "oidc", domains: [], verifiedAt: new Date("2026-01-03"), updatedAt },
  };
});

vi.mock("@/db", async () => {
  type Table = Parameters<typeof getTableName>[0];
  const rowsFor = (name: string): unknown[] => {
    switch (name) {
      case "sso_state": return [{ state: "state-1", workspaceId: "ws-1", nonce: "nonce", initiatorUserId: "user-1", codeVerifierEnc: "enc", keyId: "k", expiresAt: new Date("2099-01-01") }];
      case "sso_config": return [fx.config];
      case "workspace": return [{ id: "ws-1", slug: "acme" }];
      case "account": return [{ userId: "user-1" }];
      case "user": return [{ ...fx.user, twoFactorEnabled: fx.twoFactorEnabled }];
      case "session": return [fx.initiator, fx.session];
      case "workspace_member": return [{ role: "viewer" }];
      default: throw new Error(`Unexpected select: ${name}`);
    }
  };
  const select = () => ({ from: (table: Table) => ({ where: () => {
    const name = getTableName(table);
    const run = async () => rowsFor(name);
    return {
      then: (...args: Parameters<Promise<unknown[]>["then"]>) => run().then(...args),
      for: (mode: string) => { fx.events.push(`${name}:${mode}`); return run(); },
    };
  } }) });
  const db = {
    select,
    update: () => ({ set: () => ({ where: async () => {} }) }),
    delete: () => ({ where: async () => {} }),
    transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(db),
  };
  return { db, schema: await import("@/db/schema") };
});
vi.mock("@/lib/auth", () => ({ auth: { $context: Promise.resolve({ internalAdapter: { createSession: async () => fx.session } }) } }));
vi.mock("@/server/access", () => ({ requireWorkspace: async () => ({}) }));
vi.mock("@/server/audit", () => ({ audit: async () => {}, userActor: (u: { id: string; email: string }) => ({ kind: "user", userId: u.id, label: u.email }) }));
vi.mock("@/server/sso-link", () => ({ proposeSsoLink: async () => "link-token" }));
vi.mock("@/server/federated-mfa", () => ({ createFederatedChallenge: async () => "challenge-token" }));
vi.mock("@/server/egress", () => ({
  EgressError: class extends Error {},
  safeFetch: async () => ({ status: 200, json: () => ({ id_token: "id-token", keys: [] }) }),
}));
vi.mock("@/server/oidc", () => ({
  assertIssuerUrl: () => {},
  basicClientAuthorization: () => "Basic x",
  fetchDiscovery: async () => ({ token_endpoint: "https://idp.example/token", jwks_uri: "https://idp.example/jwks" }),
  validateIdToken: () => ({ sub: "subject-1", email: "user@example.test" }),
}));
vi.mock("@/server/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/crypto")>();
  return { ...actual, openSecret: (row: { ciphertext: string }) => (row.ciphertext === "enc" ? { verifier: "v", configStamp: fx.updatedAt.toISOString(), sessionHash: actual.sha256Hex("initiator-token") } : "client-secret") };
});
import { completeSso } from "@/server/sso";

beforeEach(() => { fx.events.length = 0; });

async function callback() {
  fx.events.length = 0;
  await completeSso({ state: "state-1", code: "code", sessionToken: "initiator-token" });
  // The first event is the pending-state row; the transaction under test starts at the user row.
  return fx.events.filter((e) => e.startsWith("user:") || e.startsWith("session:") || e.startsWith("sso_config:") || e.startsWith("workspace_member:") || e.startsWith("account:"));
}

describe("SSO callback lock order (mocked transactions: statement order only; PostgreSQL deadlock behaviour runs in CI)", () => {
  it("the local-TOTP challenge branch locks the user, then the initiating session, then tenant authority", async () => {
    fx.twoFactorEnabled = true;
    expect(await callback()).toEqual(["user:share", "session:share", "sso_config:update", "workspace_member:share", "account:share"]);
  });

  it("the direct sign-in branch locks the user, then the initiating session, then the unissued session, then tenant authority", async () => {
    fx.twoFactorEnabled = false;
    expect(await callback()).toEqual(["user:share", "session:share", "session:share", "sso_config:update", "workspace_member:share", "account:share"]);
  });
});
