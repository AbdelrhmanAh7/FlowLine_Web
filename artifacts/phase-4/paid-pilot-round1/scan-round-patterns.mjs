// Pattern-only review supplement. Never loads environment files or secret values.
// This is not the required CI evidence-secret gate or proof against unknown formats.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename } from "node:path";
const readGit = args => { const r = spawnSync("git", args, { windowsHide: true, maxBuffer: 32 * 1024 * 1024 }); if (r.status !== 0) throw Error("Git blob inspection failed"); return r.stdout; };
const base = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : undefined;
if (base && !/^[a-f0-9]{40}$/.test(base)) throw Error("Full base SHA required");
const staged = readGit(["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"]).toString("utf8").split("\0").filter(Boolean);
const changed = base ? readGit(["diff", "--name-only", "-z", "--diff-filter=ACMR", base, "HEAD"]).toString("utf8").split("\0").filter(Boolean) : [];
const paths = [...new Set([...changed, ...staged])], stagedSet = new Set(staged);
const rules = [
  ["github-token", /\b(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{36,}\b/g],
  ["github-fine-grained", /\bgithub_pat_[A-Za-z0-9_]{70,}\b/g],
  ["openai-project-key", /\bsk-proj-[A-Za-z0-9_-]{40,}\b/g],
  ["anthropic-key", /\bsk-ant-[A-Za-z0-9_-]{40,}\b/g],
  ["stripe-live", /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/g],
  ["aws-access-id", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["private-key-block", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]{80,}?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
];
const findings = [], skipped = [], classified = [];
let scanned = 0;
for (const path of paths) {
  if (basename(path).startsWith(".env")) { skipped.push({ path, reason: "owner forbids reading environment files" }); continue; }
  const bytes = readGit(["show", stagedSet.has(path) ? `:${path}` : `HEAD:${path}`]);
  if (/\.(?:png|jpe?g|gif|webp|avif|ico|woff2?|ttf|zip|pdf|mp4|webm)$/i.test(path)) { skipped.push({ path, reason: "binary format not inspected" }); continue; }
  let value;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) value = bytes.subarray(2).toString("utf16le");
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) { const copy = Buffer.from(bytes.subarray(2)); copy.swap16(); value = copy.toString("utf16le"); }
  else value = bytes.toString("utf8");
  if (value.includes("\0")) value = bytes.toString("utf16le");
  if (/\.b64$/i.test(path)) value += "\n" + Buffer.from(value.trim(), "base64").toString("utf8");
  scanned++;
  for (const [kind, expression] of rules) for (const match of value.matchAll(expression)) {
    const fingerprint = createHash("sha256").update(match[0]).digest("hex");
    const metadata = { path, kind, fingerprint };
    // Clearly repeated synthetic fixtures remain separately visible; never hide findings.
    if (/(?:fake|synthetic|test[-_])/i.test(match[0]) || /^(?:gh[pousr]_|(?:sk|rk)_live_)([A-Za-z0-9])\1{35,}$/.test(match[0])) classified.push({ ...metadata, reason: "explicitly synthetic/repeated fixture; source review still required" });
    else findings.push(metadata);
  }
}
console.log(JSON.stringify({ scope: "changed Git text blobs, UTF8/UTF16/NUL and base64 diff artifacts; pattern-only supplement", scanned, skipped, findings, classified, limitations: "No comparison to actual credentials, arbitrary formats, compressed artifacts or remote CI gate. Secret values are never printed." }, null, 2));
if (findings.length || skipped.some(p => p.reason.includes("environment"))) process.exitCode = 1;
