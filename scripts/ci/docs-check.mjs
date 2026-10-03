#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Root patterns include vitest.config.mts as well as the generic *.config.{ts,mjs,js,cjs} family.
const codePath = /^(?:(?:src|worker|scripts|e2e|tests|drizzle|deploy|\.github)\/|(?:package\.json|pnpm-lock\.yaml|Dockerfile[^/]*|docker-compose[^/]*\.yml|next\.config\.[^/]+|tsconfig[^/]*\.json|drizzle\.config\.[^/]+|(?:vitest|playwright)\.config\.[^/]+|[^/]+\.config\.(?:ts|mjs|js|cjs))$)/;

export function checkDocs(files, waived = false, body = "") {
  const code = files.filter((file) => codePath.test(file));
  const docs = files.filter((file) => file.endsWith(".md") && !file.startsWith("artifacts/"));
  // One unindented plain-text line; only horizontal whitespace may precede the reason.
  const reason = body.split(/\r?\n/).some((line) => /^Docs not needed because:[ \t]*\S.*$/.test(line));
  const waiver = waived && reason;
  const passed = code.length === 0 || docs.length > 0 || waiver;
  const summary = [
    "## Docs check", "", `Code files changed: ${code.length}`, `Docs changed: ${docs.length}`,
    ...docs.map((file) => `- ${JSON.stringify(file)}`),
    ...(code.length > 0 && docs.length === 0 && waiver ? ["Waived by docs-not-needed with a non-empty Docs not needed because: reason."] : []),
  ].join("\n") + "\n";
  return { passed, summary };
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
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, result.summary);
    else process.stdout.write(result.summary);
    if (!result.passed) {
      console.error("::error::This PR changes code but no Markdown doc outside artifacts/. Update the affected docs, or add docs-not-needed and a plain-text PR body line: Docs not needed because: <non-empty reason>.");
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`::error::Docs check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
