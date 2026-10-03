import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const paths = [...new Set([...git("diff", "--name-only", "HEAD").split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")])]
  .filter((p) => p && !p.startsWith("artifacts/")).sort();
const files = paths.map((path) => ({ path, sha256: sha256(readFileSync(path)) }));
const keys = (value, logical, prefix = "") => Object.entries(value).flatMap(([key, child]) => {
  const path = `${prefix}${key}`;
  return typeof child === "string" || (logical && "other" in child) ? [path] : keys(child, logical, `${path}.`);
});
const catalogue = (locale, base = false) => JSON.parse(base ? git("show", `origin/main:src/i18n/messages/${locale}.json`) : readFileSync(`src/i18n/messages/${locale}.json`, "utf8"));
const ar = catalogue("ar"), en = catalogue("en");
const difference = (a, b) => a.filter((key) => !b.includes(key));
const arKeys = keys(ar, true), enKeys = keys(en, true);
const i18n = {
  logicalArabic: arKeys.length, logicalEnglish: enKeys.length,
  missingEnglish: difference(arKeys, enKeys), missingArabic: difference(enKeys, arKeys),
  rawArabicOnly: difference(keys(ar, false), keys(en, false)).length,
  baselineRawArabicOnly: difference(keys(catalogue("ar", true), false), keys(catalogue("en", true), false)).length,
};
const result = {
  head: git("rev-parse", "HEAD"), branch: git("branch", "--show-current"), originMain: git("rev-parse", "origin/main"),
  sourceFingerprint: sha256(JSON.stringify(files)), files, i18n,
};
writeFileSync(new URL("source-manifest.json", import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ sourceFingerprint: result.sourceFingerprint, files: files.length, i18n }));
if (i18n.missingEnglish.length || i18n.missingArabic.length) process.exitCode = 1;
