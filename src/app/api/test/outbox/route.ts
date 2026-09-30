import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { testFeaturesEnabled } from "@/server/faults";
import { json, notFound, route } from "@/server/http";

/**
 * TEST ENVIRONMENT ONLY — 404 everywhere else. The E2E "inbox": the latest messages the outbox provider stored for
 * one address, newest first, with the first link in each (e.g. the verification link a user would click).
 */
export const GET = route(async (req) => {
  if (!testFeaturesEnabled()) throw notFound();
  const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) throw notFound();
  const rows = await db
    .select()
    .from(schema.emailOutbox)
    .where(sql`lower(${schema.emailOutbox.recipient}) = ${email}`)
    .orderBy(desc(schema.emailOutbox.createdAt))
    .limit(10);
  return json({
    messages: rows.map((m) => ({
      subject: m.subject,
      text: m.plainText,
      purpose: m.tags?.purpose ?? null,
      link: /https?:\/\/\S+/.exec(m.plainText)?.[0] ?? null,
      createdAt: m.createdAt,
    })),
  });
});
