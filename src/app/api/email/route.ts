import { z } from "zod";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requireUser } from "@/server/access";
import { sha256Hex } from "@/server/crypto";
import { consumeAccountToken, issueAccountToken, requestToken, sendNotice, tokenState } from "@/server/email/flows";
import { safePath } from "@/server/email/redirect";
import { json, parseBody, route } from "@/server/http";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["forgot", "resend"]), email: z.email().max(254) }),
  z.object({ action: z.enum(["verify", "reset", "deleteConfirm"]), token: z.string().max(100), password: z.string().optional(), callbackURL: z.string().max(1000).optional() }),
  z.object({ action: z.literal("deleteRequest") }),
]);

export const POST = route(async (request) => {
  const input = await parseBody(request, body);
  if (input.action === "forgot" || input.action === "resend") {
    await requestToken(input.action === "forgot" ? "reset" : "verify", input.email.trim().toLowerCase(), request);
    return json({ status: "sent_if_eligible" });
  }
  if (input.action === "deleteRequest") {
    const user = await requireUser();
    await issueAccountToken("delete", user, request);
    return json({ status: "sent" });
  }
  if (!("token" in input)) return json({ status: "invalid" });
  const purpose = input.action === "deleteConfirm" ? "delete" : input.action;
  const user = purpose === "delete" ? await requireUser() : null;
  const before = await tokenState(purpose, input.token);
  if (before !== "valid") return json({ status: before });
  const [row] = await db.select({ email: schema.user.email }).from(schema.emailToken).innerJoin(schema.user, eq(schema.user.id, schema.emailToken.userId)).where(eq(schema.emailToken.tokenHash, sha256Hex(input.token)));
  const status = await consumeAccountToken(purpose, input.token, input.password, user?.id);
  if (status === "done" && row && purpose !== "delete") await sendNotice(purpose === "verify" ? "emailVerified" : "passwordChanged", row.email, request).catch(() => {});
  return json({ status, next: purpose === "delete" ? "/sign-in" : safePath(input.callbackURL, "/sign-in") });
});
