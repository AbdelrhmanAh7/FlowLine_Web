/**
 * Crypto v2 maintenance (docs/security/CREDENTIALS_DESIGN.md MUST 4–5). Run ON THE HOST by the operator:
 *
 *   node scripts/with-env.mjs .env.beta npx tsx scripts/admin/rewrap.mts [--dry-run]
 *     Upgrades every row still marked legacy (v1, no AAD) to a context-bound v2 envelope, re-wraps every data key that
 *     isn't under the CURRENT key of its ring (after rotating FLOWLINE_ENCRYPTION_KEY / FLOWLINE_PLATFORM_ENCRYPTION_KEY,
 *     keep the old key in *_KEYS_OLD until this reports "Rotation complete" — remaining=0 and failed=0 for every
 *     table, including social-login tokens), and encrypts social-login tokens stored in plaintext before this release.
 *     Exits 1 while anything still needs an old key.
 *
 *   node scripts/with-env.mjs .env.beta npx tsx scripts/admin/rewrap.mts --backfill-oauth-app google --client-id <id> [--dry-run]
 *     ONLY if deployment history proves that <id> issued the existing Google/Slack/GitHub connections, binds those legacy
 *     connections to Flowline's platform app. Without it they must reconnect at their next refresh (never guessed).
 *
 * Prints counts only — never a secret. Audited as crypto.rewrap in platform_audit_event.
 */
import { pool } from "@/db";
import { OAUTH_FAMILIES, type OAuthFamily } from "@/server/platform-purposes";
import { backfillLegacyOAuthApp, rewrapAll, rotationComplete } from "@/server/rewrap";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const dryRun = process.argv.includes("--dry-run");

try {
  const family = arg("backfill-oauth-app");
  if (family) {
    const clientId = arg("client-id");
    if (!(family in OAUTH_FAMILIES) || !clientId) {
      console.error("Usage: --backfill-oauth-app google|slack|github --client-id <the client id that issued them> [--dry-run]");
      process.exitCode = 2;
    } else {
      const n = await backfillLegacyOAuthApp(family as OAuthFamily, clientId, { dryRun });
      console.log(`${dryRun ? "[dry run] would bind" : "Bound"} ${n} legacy ${family} connection(s) to client id ${clientId}.`);
    }
  } else {
    const report = await rewrapAll({ dryRun });
    for (const r of report) console.log(`${r.table.padEnd(22)} rewrapped=${r.rewrapped} legacy_upgraded=${r.legacyUpgraded} failed=${r.failed} remaining=${r.remaining}`);
    if (report.some((r) => r.failed)) {
      console.error("Some rows could not be opened with the configured keys (see failed=). Nothing was guessed; they stay as they are.");
    }
    if (dryRun) console.log("[dry run] nothing was written; remaining= is what a real run would have to rewrap.");
    else if (rotationComplete(report)) console.log("Rotation complete: nothing needs an old key any more. The old key(s) may be removed from *_KEYS_OLD.");
    if (!rotationComplete(report)) {
      const left = report.filter((r) => r.remaining || r.failed).map((r) => `${r.table}=${r.remaining}`).join(", ");
      console.error(`Rotation is NOT complete (${left}): keep the old key(s) in *_KEYS_OLD and run this again (values written concurrently are picked up on the next run).`);
      process.exitCode = 1;
    }
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  await pool.end();
}
