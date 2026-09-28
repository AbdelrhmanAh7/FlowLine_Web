#!/usr/bin/env node
/**
 * QA test inbox for LOCAL STAGING (FLOWLINE_EMAIL_PROVIDER=outbox): prints the newest emails sent to one address
 * (subject, purpose, first link). Read-only; reads STAGING_DB_PASSWORD from .env.staging and never prints it.
 *   node artifacts/phase-4/codex-qa/scripts/inbox.mjs someone@flowline-qa.test [count]
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseEnvFile } from "../../../../scripts/release/lib/email-token.mjs";

const [email, count = "3"] = process.argv.slice(2);
if (!email) {
  console.error("usage: inbox.mjs <email> [count]");
  process.exit(2);
}
const env = parseEnvFile(readFileSync(".env.staging", "utf8"));
const client = new pg.Client({ connectionString: `postgres://flowline:${env.STAGING_DB_PASSWORD}@127.0.0.1:5434/flowline` });
await client.connect();
const { rows } = await client.query(
  "select subject, plain_text, tags, created_at from email_outbox where lower(recipient) = lower($1) order by created_at desc limit $2",
  [email, Number(count)],
);
await client.end();
if (!rows.length) console.log("(no email for that address yet)");
for (const r of rows) console.log(JSON.stringify({ at: r.created_at, subject: r.subject, purpose: r.tags?.purpose ?? null, link: /https?:\/\/\S+/.exec(r.plain_text)?.[0] ?? null }));
