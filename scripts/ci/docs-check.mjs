#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Root patterns include vitest.config.mts as well as the generic *.config.{ts,mjs,js,cjs} family.
const codePath = /^(?:(?:src|worker|scripts|e2e|tests|drizzle|deploy|\.github)\/|(?:package\.json|pnpm-lock\.yaml|Dockerfile[^/]*|docker-compose[^/]*\.yml|next\.config\.[^/]+|tsconfig[^/]*\.json|drizzle\.config\.[^/]+|(?:vitest|playwright)\.config\.[^/]+|[^/]+\.config\.(?:ts|mjs|js|cjs))$)/;

// GitHub's PR files API lists at most 3000 files. A list that long may have dropped code files, so the check fails
// closed: it assumes code changed, which then needs a visible non-artifacts Markdown change or a valid waiver.
export const FILE_LIST_LIMIT = 3000;

// One unindented plain-text line `Docs not needed because: <reason>`; only horizontal whitespace may precede the reason.
const waiverLine = /^Docs not needed because:[ \t]*(\S.*)$/;

// The PR template shows `<reason>`; leaving it (any case or inner spacing, quoted or in backticks, with trailing
// punctuation) or the bare word `reason` is an unfilled template, not a reason. So is any lone `<...>` token, and so is
// any reason that still contains the template's `<reason>` token: a real explanation never includes it.
export function isPlaceholderReason(reason) {
  const bare = reason.trim().replace(/^[`"'*_]+|[`"'*_.!]+$/g, "").trim();
  return /^<[^<>]*>$/.test(bare) || /^reason$/i.test(bare) || /<\s*reason\s*>/i.test(reason);
}

export const hasWaiverReason = (body) => body.split(/\r?\n/).some((line) => {
  const match = waiverLine.exec(line);
  return match !== null && !isPlaceholderReason(match[1]);
});

export function checkDocs(files, waived = false, body = "") {
  const code = files.filter((file) => codePath.test(file));
  const docs = files.filter((file) => file.endsWith(".md") && !file.startsWith("artifacts/"));
  const truncated = files.length >= FILE_LIST_LIMIT;
  const codeChanged = code.length > 0 || truncated;
  const waiver = waived && hasWaiverReason(body);
  const passed = !codeChanged || docs.length > 0 || waiver;
  const summary = [
    "## Docs check", "", `Code files changed: ${code.length}`, `Docs changed: ${docs.length}`,
    ...docs.map((file) => `- ${JSON.stringify(file)}`),
    ...(truncated ? ["", `File list has ${files.length} entries, which reaches GitHub's ${FILE_LIST_LIMIT}-file limit, so it may be truncated: assuming code changed.`] : []),
    ...(codeChanged && docs.length === 0 && waiver ? ["Waived by docs-not-needed with a filled-in Docs not needed because: line."] : []),
  ].join("\n") + "\n";
  return { passed, summary, truncated };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    // gh api --paginate --slurp produces an array of pages; JSON preserves spaces and embedded newlines.
    const pages = JSON.parse(readFileSync(0, "utf8"));
    if (!Array.isArray(pages) || !pages.every((page) => Array.isArray(page)
      && page.every((file) => typeof file?.filename === "string"))) {
      throw new Error("expected paginated PR files JSON");
    }
    const result = checkDocs(pages.flat().map((file) => file.filename), process.env.WAIVED === "true", process.env.PR_BODY ?? "");
    if (result.truncated) console.error(`::warning::The PR file list reached GitHub's ${FILE_LIST_LIMIT}-file limit, so code is assumed changed and docs (or a waiver) are required.`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, result.summary);
    else process.stdout.write(result.summary);
    if (!result.passed) {
      const subject = result.truncated
        ? `This PR lists ${FILE_LIST_LIMIT} files or more, so code is assumed changed, but it has`
        : "This PR changes code but has";
      console.error(`::error::${subject} no Markdown doc outside artifacts/. Update the affected docs, or add docs-not-needed and a plain-text PR body line: Docs not needed because: followed by your real reason (not the <reason> placeholder).`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`::error::Docs check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
