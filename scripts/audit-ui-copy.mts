/** Complete catalogue inventory plus source-level untranslated JSX findings. No credentials or runtime data. */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { ar } from "../src/i18n/messages/ar";
import { en } from "../src/i18n/messages/en";

const out = process.argv[2] ?? "artifacts/phase-4/ui-copy-20261001";
mkdirSync(out, { recursive: true });
type Entry = { key: string; values: string[]; plural: boolean };
function flatten(value: unknown, key = ""): Entry[] {
  if (typeof value === "string") return [{ key, values: [value], plural: false }];
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (typeof record.other === "string") return [{ key, values: Object.values(record).filter((v): v is string => typeof v === "string"), plural: true }];
  return Object.entries(record).flatMap(([name, v]) => flatten(v, key ? `${key}.${name}` : name));
}
const arabic = flatten(ar);
const english = new Map(flatten(en).map((entry) => [entry.key, entry]));
const parameters = (e: Entry) => [...new Set(e.values.flatMap((v) => [...v.matchAll(/\{([a-zA-Z][\w]*)\}/g)].map((m) => m[1])).filter((p) => !(e.plural && p === "count")))].sort();
const issues: { key: string; reason: string }[] = [];
for (const a of arabic) {
  const e = english.get(a.key);
  if (!e) issues.push({ key: a.key, reason: "missing English key" });
  else if (JSON.stringify(parameters(a)) !== JSON.stringify(parameters(e))) issues.push({ key: a.key, reason: `placeholder mismatch: AR ${parameters(a)} / EN ${parameters(e)}` });
  // Zero-count suffixes intentionally omit a notice when nothing is paused/waiting.
  const optionalZeroSuffix = ["flows.activity.pausedFlows", "flows.activity.runsWaiting", "integrations.bannerPaused"].includes(a.key);
  if (!optionalZeroSuffix && (a.values.some((v) => !v.trim()) || e?.values.some((v) => !v.trim()))) issues.push({ key: a.key, reason: "empty message" });
}
for (const key of english.keys()) if (!arabic.some((entry) => entry.key === key)) issues.push({ key, reason: "missing Arabic key" });
const literals: { file: string; line: number; text: string; kind: string }[] = [];
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : []);
const sources = walk("src");
for (const file of sources) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const record = (node: ts.Node, text: string, kind: string) => {
    const value = text.replace(/\s+/g, " ").trim();
    if (/\p{L}/u.test(value)) literals.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: value, kind });
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) record(node, node.text, "JSX text");
    if (ts.isJsxAttribute(node) && ["title", "placeholder", "aria-label", "alt"].includes(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)) record(node, node.initializer.text, "attribute");
    ts.forEachChild(node, visit);
  };
  visit(source);
}
writeFileSync(join(out, "catalogue.tsv"), "key\tar\ten\n" + arabic.map((a) => [a.key, a.values.join(" / "), english.get(a.key)?.values.join(" / ") ?? ""].map((v) => v.replace(/[\t\r\n]/g, " ")).join("\t")).join("\n") + "\n");
writeFileSync(join(out, "audit.json"), JSON.stringify({ messages: arabic.length, englishMessages: english.size, sourceFiles: sources.length, issues, literals }, null, 2) + "\n");
console.log(JSON.stringify({ messages: arabic.length, englishMessages: english.size, sourceFiles: sources.length, issues: issues.length, sourceLiteralsToReview: literals.length, out }));
process.exitCode = issues.length ? 1 : 0;
