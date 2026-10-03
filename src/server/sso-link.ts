import { randomUUID } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import { db, schema } from "@/db";
import { requireWorkspace } from "./access";
import { audit, userActor } from "./audit";
import { randomToken, sha256Hex } from "./crypto";
import { HttpError } from "./http";
import { checkRate } from "./rate-limit";
import { verifyTotp } from "./platform-access";
import { consumeFederatedTotpStep } from "./federated-mfa";
import { ssoProviderId } from "./sso";
import { deliverAccountToken, prepareAccountToken } from "./email/flows";

export const SSO_LINK_COOKIE = "fl_sso_link";
interface LinkIntent {
  userId: string; email: string; workspaceId: string; issuer: string; clientId: string;
  subject: string; configStamp: string; sessionHash: string;
  mailboxTokenId?: string;
}
const identifier = (token: string) => `sso-link:${sha256Hex(token)}`;
const invalid = () => new HttpError(403, "SSO_LINK_INVALID", "Restart SSO and confirm the link while signed in");

async function liveSession(userId: string, sessionToken?: string, sessionHash?: string | null) {
  if (!sessionToken || !sessionHash || sha256Hex(sessionToken) !== sessionHash) throw invalid();
  const [session] = await db.select().from(schema.session).where(and(eq(schema.session.token, sessionToken), eq(schema.session.userId, userId), gt(schema.session.expiresAt, new Date())));
  if (!session) throw invalid();
  return session;
}

/** Callback GET creates only a short-lived proposal; no account or membership is written. */
export async function proposeSsoLink(input: Omit<LinkIntent, "userId" | "email" | "sessionHash"> & { user: typeof schema.user.$inferSelect; sessionHash: string | null; sessionToken?: string }) {
  await liveSession(input.user.id, input.sessionToken, input.sessionHash);
  await requireWorkspace(input.user, input.workspaceId, "viewer");
  const intent: LinkIntent = { userId: input.user.id, email: input.user.email, workspaceId: input.workspaceId, issuer: input.issuer, clientId: input.clientId, subject: input.subject, configStamp: input.configStamp, sessionHash: input.sessionHash! };
  const token = randomToken(32);
  await db.insert(schema.verification).values({ id: randomUUID(), identifier: identifier(token), value: JSON.stringify(intent), expiresAt: new Date(Date.now() + 600_000) });
  return token;
}

export async function ssoLinkDetails(token: string, sessionToken: string) {
  const [pending] = await db.select().from(schema.verification).where(and(eq(schema.verification.identifier, identifier(token)), gt(schema.verification.expiresAt, new Date())));
  if (!pending) throw invalid();
  const intent = JSON.parse(pending.value) as LinkIntent;
  const session = await liveSession(intent.userId, sessionToken, intent.sessionHash);
  const [user] = await db.select().from(schema.user).where(eq(schema.user.id, intent.userId));
  const [credential] = await db.select().from(schema.account).where(and(eq(schema.account.userId, intent.userId), eq(schema.account.providerId, "credential")));
  if (!user || user.email !== intent.email) throw invalid();
  const [factor] = user.twoFactorEnabled ? await db.select().from(schema.twoFactor).where(eq(schema.twoFactor.userId, user.id)) : [];
  const [proof] = intent.mailboxTokenId ? await db.select().from(schema.emailToken).where(and(eq(schema.emailToken.id, intent.mailboxTokenId), eq(schema.emailToken.userId, user.id), eq(schema.emailToken.purpose, "verify"))) : [];
  const mailboxVerified = Boolean(user.emailVerified && proof?.consumedAt);
  return { intent, session, user, needsTotp: user.twoFactorEnabled, needsPassword: Boolean(credential?.password), passwordHash: credential?.password, factorHash: factor && factor.verified !== false ? sha256Hex(factor.secret) : null, mailboxVerified };
}

/** Fresh Flowline verification is required even for historical tenant-created
 * users whose emailVerified flag was set by an untrusted IdP. It is tied to this
 * exact proposal, rather than inheriting an unrelated verification token.
 */
export async function sendSsoLinkVerification(token: string, sessionToken: string, req?: Request) {
  const { intent, user } = await ssoLinkDetails(token, sessionToken);
  await requireWorkspace(user, intent.workspaceId, "viewer");
  const proof = await prepareAccountToken("verify", user, req, { callbackURL: "/sso/link" });
  try {
    await db.transaction(async (tx) => {
      const [pending] = await tx.select().from(schema.verification).where(and(eq(schema.verification.identifier, identifier(token)), gt(schema.verification.expiresAt, new Date()))).for("update");
      if (!pending || pending.value !== JSON.stringify(intent)) throw invalid();
      await tx.update(schema.verification).set({ value: JSON.stringify({ ...intent, mailboxTokenId: proof.id }) }).where(eq(schema.verification.id, pending.id));
    });
  } catch (error) {
    // The attachment transaction has rolled back; cleanup must not be rolled back with it.
    await db.delete(schema.emailToken).where(eq(schema.emailToken.id, proof.id));
    throw error;
  }
  await deliverAccountToken(proof, req);
}

/** Only called by the explicit, exact-origin + CSRF-protected POST confirmation. */
export async function confirmSsoLink(token: string, sessionToken: string, assurance: { password?: string; code?: string }) {
  const details = await ssoLinkDetails(token, sessionToken);
  const { intent, user, session } = details;
  if (!details.mailboxVerified) throw new HttpError(403, "SSO_EMAIL_OWNERSHIP_REQUIRED", "Verify ownership through the Flowline email link");
  await requireWorkspace(user, intent.workspaceId, "viewer");
  if (!(await checkRate(`sso-link:${user.id}`, 5, 300))) throw new HttpError(429, "RATE_LIMITED", "Try again later");
  let totpStep: number | null = null;
  if (details.needsTotp) {
    totpStep = await verifyTotp(user.id, assurance.code ?? "");
    if (totpStep === null) throw new HttpError(403, "SSO_LINK_ASSURANCE", "Confirm with your authenticator");
  } else if (details.needsPassword) {
    if (!assurance.password || !(await verifyPassword({ hash: details.passwordHash!, password: assurance.password }))) throw new HttpError(403, "SSO_LINK_ASSURANCE", "Confirm with your password");
  } else if (Date.now() - session.createdAt.getTime() > 300_000) {
    throw new HttpError(403, "SSO_LINK_ASSURANCE", "Sign in again before linking");
  }
  return db.transaction(async (tx) => {
    const [pending] = await tx.select().from(schema.verification).where(and(eq(schema.verification.identifier, identifier(token)), gt(schema.verification.expiresAt, new Date()))).for("update");
    if (!pending || pending.value !== JSON.stringify(intent)) throw invalid();
    const [currentSession] = await tx.select().from(schema.session).where(and(eq(schema.session.token, sessionToken), eq(schema.session.userId, user.id), gt(schema.session.expiresAt, new Date()))).for("update");
    const [currentUser] = await tx.select().from(schema.user).where(eq(schema.user.id, user.id)).for("update");
    const [currentFactor] = user.twoFactorEnabled ? await tx.select().from(schema.twoFactor).where(eq(schema.twoFactor.userId, user.id)).for("share") : [];
    const [currentCredential] = await tx.select().from(schema.account).where(and(eq(schema.account.userId, user.id), eq(schema.account.providerId, "credential"))).for("share");
    if ((user.twoFactorEnabled && (!currentFactor || currentFactor.verified === false || sha256Hex(currentFactor.secret) !== details.factorHash)) || (currentCredential?.password ?? null) !== (details.passwordHash ?? null)) throw invalid();
    const [cfg] = await tx.select().from(schema.ssoConfig).where(eq(schema.ssoConfig.workspaceId, intent.workspaceId)).for("update");
    const [member] = await tx.select().from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, intent.workspaceId), eq(schema.workspaceMember.userId, user.id))).for("update");
    if (!currentSession || !currentUser || !currentUser.emailVerified || currentUser.email !== intent.email || currentUser.updatedAt.toISOString() !== user.updatedAt.toISOString() || currentUser.twoFactorEnabled !== user.twoFactorEnabled || !cfg || cfg.updatedAt.toISOString() !== intent.configStamp || !member || (!cfg.enabled && member.role !== "owner")) throw invalid();
    const providerId = ssoProviderId(intent.workspaceId, cfg.issuer, cfg.clientId);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${providerId}:${intent.subject}`}))`);
    const [linked] = await tx.select().from(schema.account).where(and(eq(schema.account.providerId, providerId), eq(schema.account.accountId, intent.subject)));
    if (linked && linked.userId !== user.id) throw invalid();
    // After every authority check, inside this transaction: a code already used at a federated gate cannot confirm a link.
    if (totpStep !== null && !(await consumeFederatedTotpStep(tx, user.id, totpStep))) throw new HttpError(403, "SSO_LINK_ASSURANCE", "That code was already used. Confirm with the next code from your authenticator");
    if (!linked) await tx.insert(schema.account).values({ id: randomUUID(), userId: user.id, providerId, accountId: intent.subject });
    if (!cfg.verifiedAt) await tx.update(schema.ssoConfig).set({ verifiedAt: new Date(), updatedAt: new Date() }).where(eq(schema.ssoConfig.workspaceId, intent.workspaceId));
    await tx.delete(schema.verification).where(eq(schema.verification.id, pending.id));
    await audit(tx, { workspaceId: intent.workspaceId, actor: userActor(user), action: "sso.link_confirmed", targetType: "user", targetId: user.id, data: { issuer: cfg.issuer } });
    const [ws] = await tx.select().from(schema.workspace).where(eq(schema.workspace.id, intent.workspaceId));
    return { slug: ws!.slug };
  });
}
