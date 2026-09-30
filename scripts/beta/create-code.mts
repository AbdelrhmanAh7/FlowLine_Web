/**
 * Creates a private-beta access code (P4-12). The code is printed ONCE; only its hash is stored.
 *   node scripts/with-env.mjs .env.beta npx tsx scripts/beta/create-code.mts --label "Ahmed (design partner)" [--uses 1] [--days 14]
 */
import { createBetaCode } from "@/server/beta";

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const label = arg("label");
if (!label) {
  console.error('Usage: --label "who it is for" [--uses N] [--days N]');
  process.exit(2);
}
const { code, id } = await createBetaCode({ label, maxUses: Number(arg("uses", "1")), expiresInDays: Number(arg("days", "14")) });
console.log(`Beta code for "${label}" (id ${id}): ${code}`);
console.log("Share it privately; it is not stored in readable form and can't be shown again.");
process.exit(0);
