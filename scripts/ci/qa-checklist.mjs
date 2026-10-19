#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CHECKLIST_IDS = [
  "actions-pinned-sha",
  "ubuntu-2404-runner",
  "no-self-hosted",
  "gate-secrets",
  "fast-tier-timeout",
  "least-privilege-permissions",
  "pr-target-checkout",
  "claude-inert-without-secret",
];

export function findLineNumber(text, matcher, start = 0) {
  const lines = text.split(/\r?\n/);
  for (let i = start; i < lines.length; i++) {
    if (typeof matcher === "string" ? lines[i].includes(matcher) : matcher.test(lines[i])) return i + 1;
  }
  return 1;
}

export function parseJobs(text) {
  const idx = text.indexOf("\njobs:\n");
  if (idx === -1) return {};
  const parts = text.slice(idx + 7).split(/^ {2}([a-zA-Z0-9_-]+):[ \t]*$/m);
  const res = {};
  for (let i = 1; i < parts.length; i += 2) res[parts[i]] = parts[i + 1];
  return res;
}

export function evaluateChecklist(options = {}) {
  const root = options.root || fileURLToPath(new URL("../../", import.meta.url));
  const gateRel = options.gateRelPath || ".github/workflows/gate.yml";
  const claudeRel = options.claudeRelPath || ".github/workflows/claude.yml";
  const gateReportRel = options.gateReportRelPath || ".github/actions/gate-report/action.yml";

  const readSafe = (rel, override) => {
    if (override !== undefined) return override;
    const p = join(root, rel);
    return existsSync(p) ? readFileSync(p, "utf8") : "";
  };

  const gate = readSafe(gateRel, options.gateWorkflow);
  const claude = readSafe(claudeRel, options.claudeWorkflow);
  const report = readSafe(gateReportRel, options.gateReportAction);

  const results = [];

  // 1. actions-pinned-sha
  let unpinned = null, firstAction = null;
  for (const f of [{ rel: gateRel, text: gate }, { rel: claudeRel, text: claude }, { rel: gateReportRel, text: report }]) {
    for (const [i, line] of f.text.split(/\r?\n/).entries()) {
      const m = /^\s*(?:-\s+)?uses:\s*(\S+)/.exec(line);
      if (!m || m[1].startsWith("./") || m[1].startsWith("docker://")) continue;
      const ref = m[1].replace(/#.*$/, "").trim();
      if (!/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/.test(ref)) {
        unpinned = { id: "actions-pinned-sha", status: "FINDING", file: f.rel, line: i + 1, detail: `Action '${ref}' is not pinned by a 40-character commit SHA` };
        break;
      }
      if (!firstAction) firstAction = { file: f.rel, line: i + 1 };
    }
    if (unpinned) break;
  }
  results.push(unpinned || { id: "actions-pinned-sha", status: "PASS", file: firstAction?.file || gateRel, line: firstAction?.line || 1, detail: "All external actions are pinned by a 40-character commit SHA" });

  // 2. ubuntu-2404-runner
  let badRunner = null, firstRunner = null;
  for (const f of [{ rel: gateRel, text: gate }, { rel: claudeRel, text: claude }]) {
    for (const [i, line] of f.text.split(/\r?\n/).entries()) {
      const m = /^\s*runs-on:\s*(.+)$/.exec(line);
      if (!m) continue;
      const runner = m[1].replace(/#.*$/, "").trim();
      if (runner !== "ubuntu-24.04") {
        badRunner = { id: "ubuntu-2404-runner", status: "FINDING", file: f.rel, line: i + 1, detail: `Job specifies runner '${runner}' instead of ubuntu-24.04` };
        break;
      }
      if (!firstRunner) firstRunner = { file: f.rel, line: i + 1 };
    }
    if (badRunner) break;
  }
  results.push(badRunner || { id: "ubuntu-2404-runner", status: "PASS", file: firstRunner?.file || gateRel, line: firstRunner?.line || 1, detail: "All jobs declare runs-on: ubuntu-24.04" });

  // 3. no-self-hosted
  let selfHosted = null, runnerLine = null;
  for (const f of [{ rel: gateRel, text: gate }, { rel: claudeRel, text: claude }]) {
    for (const [i, line] of f.text.split(/\r?\n/).entries()) {
      if (/^\s*#/.test(line)) continue;
      if (/self-hosted/i.test(line)) {
        selfHosted = { id: "no-self-hosted", status: "FINDING", file: f.rel, line: i + 1, detail: "Found self-hosted runner label" };
        break;
      }
      if (!runnerLine && /runs-on:/.test(line)) runnerLine = { file: f.rel, line: i + 1 };
    }
    if (selfHosted) break;
  }
  results.push(selfHosted || { id: "no-self-hosted", status: "PASS", file: runnerLine?.file || gateRel, line: runnerLine?.line || 1, detail: "No self-hosted runner labels found" });

  // 4. gate-secrets
  let secretRef = null, gateTokenLine = null;
  for (const [i, line] of gate.split(/\r?\n/).entries()) {
    if (/^\s*#/.test(line)) continue;
    if (/secrets\./i.test(line)) {
      secretRef = { id: "gate-secrets", status: "FINDING", file: gateRel, line: i + 1, detail: `Found secret reference in ${gateRel}` };
      break;
    }
    if (!gateTokenLine && (/GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/.test(line) || /permissions:/.test(line))) {
      gateTokenLine = { file: gateRel, line: i + 1 };
    }
  }
  results.push(secretRef || { id: "gate-secrets", status: "PASS", file: gateTokenLine?.file || gateRel, line: gateTokenLine?.line || 1, detail: "No secrets beyond GITHUB_TOKEN used in gate.yml" });

  // 5. fast-tier-timeout
  const gateJobs = parseJobs(gate);
  let timeoutFinding = null, firstTimeout = null;
  for (const name of ["changes", "checks", "chromium", "gate"]) {
    const block = gateJobs[name];
    if (!block) continue;
    const m = /^ {4}timeout-minutes:\s*(\d+)/m.exec(block);
    const jLine = findLineNumber(gate, new RegExp(`^  ${name}:`));
    if (!m || m[1] !== "5") {
      timeoutFinding = { id: "fast-tier-timeout", status: "FINDING", file: gateRel, line: m ? findLineNumber(gate, /^ {4}timeout-minutes:/, jLine - 1) : jLine, detail: `Job '${name}' has timeout-minutes: ${m ? m[1] : "missing"} (expected 5)` };
      break;
    }
    if (!firstTimeout) firstTimeout = findLineNumber(gate, /^ {4}timeout-minutes:\s*5/, jLine - 1);
  }
  if (!timeoutFinding && gateJobs.chromium) {
    const c = gateJobs.chromium;
    if ((c.includes("tier == 'full'") || c.includes("inputs.tier == 'full'") || /GATE_TIER:\s*full/.test(c)) && (!c.includes("strategy:") || !c.includes("matrix:"))) {
      const cLine = findLineNumber(gate, /^  chromium:/);
      timeoutFinding = { id: "fast-tier-timeout", status: "FINDING", file: gateRel, line: findLineNumber(gate, /^ {4}timeout-minutes:\s*5/, cLine - 1), detail: "Chromium job runs full tier under 5-minute timeout without matrix sharding" };
    }
  }
  results.push(timeoutFinding || { id: "fast-tier-timeout", status: "PASS", file: gateRel, line: firstTimeout || 1, detail: "Every fast-tier job has timeout-minutes: 5" });

  // 6. least-privilege-permissions
  const claudeJobs = parseJobs(claude);
  let permFinding = null;
  if (claudeJobs.review) {
    const r = claudeJobs.review;
    if (/pull-requests:\s*write|issues:\s*write/.test(r) && !/collaborators\/.*\/permission|gh api.*collaborators/.test(r)) {
      const rLine = findLineNumber(claude, /^  review:/);
      permFinding = { id: "least-privilege-permissions", status: "FINDING", file: claudeRel, line: findLineNumber(claude, /- name: Gate/, rLine - 1) || rLine, detail: "Review job requests write permissions without collaborator write-permission verification" };
    }
  }
  if (!permFinding && /^permissions:\n( {2}[a-zA-Z0-9_-]+:\s*[a-zA-Z0-9_-]+\n?)+/m.test(gate) && /contents:\s*write/.test(gate)) {
    permFinding = { id: "least-privilege-permissions", status: "FINDING", file: gateRel, line: findLineNumber(gate, /^permissions:/), detail: "gate.yml declares write permissions at workflow root" };
  }
  results.push(permFinding || { id: "least-privilege-permissions", status: "PASS", file: gateRel, line: findLineNumber(gate, /^permissions:/) || 1, detail: "Workflows enforce least-privilege permissions" });

  // 7. pr-target-checkout
  let prTarget = null;
  for (const f of [{ rel: gateRel, text: gate }, { rel: claudeRel, text: claude }]) {
    for (const [i, line] of f.text.split(/\r?\n/).entries()) {
      if (/^\s*#/.test(line)) continue;
      if (/pull_request_target/.test(line) && /head\.ref|head\.sha/.test(f.text)) {
        prTarget = { id: "pr-target-checkout", status: "FINDING", file: f.rel, line: i + 1, detail: "Checkout of untrusted head code under pull_request_target" };
        break;
      }
    }
    if (prTarget) break;
  }
  results.push(prTarget || { id: "pr-target-checkout", status: "PASS", file: gateRel, line: findLineNumber(gate, /pull_request:/) || 1, detail: "No pull_request_target checkout of untrusted code" });

  // 8. claude-inert-without-secret
  let inertFinding = null;
  if (claude) {
    for (const [name, block] of Object.entries(claudeJobs)) {
      const hasToken = /HAS_TOKEN:\s*\$\{\{\s*secrets\.CLAUDE_CODE_OAUTH_TOKEN\s*!=\s*''\s*\}\}/.test(block);
      const gatesToken = /HAS_TOKEN.*=.*"true"|\[\s*"\$HAS_TOKEN"\s*=\s*"true"\s*\]/.test(block);
      if (!hasToken || !gatesToken) {
        inertFinding = { id: "claude-inert-without-secret", status: "FINDING", file: claudeRel, line: findLineNumber(claude, new RegExp(`^  ${name}:`)), detail: `Job '${name}' does not ensure workflow is inert when CLAUDE_CODE_OAUTH_TOKEN is missing` };
        break;
      }
    }
  }
  results.push(inertFinding || { id: "claude-inert-without-secret", status: "PASS", file: claudeRel, line: findLineNumber(claude, /HAS_TOKEN:\s*\$\{\{\s*secrets\.CLAUDE_CODE_OAUTH_TOKEN/) || 1, detail: "Claude workflow stays inert without CLAUDE_CODE_OAUTH_TOKEN secret" });

  return results;
}

export function formatMarkdown(results) {
  return results.map((r) => `${r.status} ${r.id} ${r.detail} ${r.file}:${r.line}`).join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = evaluateChecklist();
  console.log(process.argv.includes("--json") ? JSON.stringify(results, null, 2) : formatMarkdown(results));
  process.exitCode = results.some((r) => r.status === "FINDING") ? 1 : 0;
}
