# OWNER_CLI_PROTOTYPE — Claude Code / Codex CLI boundary

Founder-only, private, synthetic data, explicitly started trials. **Not** a customer feature, **not** offline inference,
**not** free or unlimited: the CLIs send prompts to their vendors' cloud services under the founder's own login and
plan limits. No customer or public endpoint can invoke it; paying, accepting an invitation or being a workspace Owner
never grants it.

## What was verified in the cloud session (2026-09-30) — and what was not

| Item | Result | Evidence |
|---|---|---|
| Claude Code CLI present | `claude` 2.1.286 at `/opt/node22/bin/claude`, x86_64 | `claude --version`, `uname -m` |
| Claude structured output / isolation flags | present in `--help`: `--print`, `--output-format json`, `--json-schema`, `--tools ""`, `--restricted`, `--strict-mcp-config`, `--mcp-config`, `--disable-slash-commands`, `--no-session-persistence`, `--system-prompt`, `--max-budget-usd` | installed `--help` (flags the adapter requires are re-checked by preflight on every job) |
| `--bare` | NOT usable with subscription login: help says "Anthropic auth is strictly ANTHROPIC_API_KEY or apiKeyHelper … OAuth and keychain are never read" | installed `--help`; hence isolation uses `--restricted` + `--tools ""` + strict empty MCP + no-session + a fresh job dir, and preflight fails closed on inherited `CLAUDE.md` files |
| `claude auth status` | logged in via an OAuth token that belongs to **this cloud session**, not the founder's laptop | official status command (status only; no credential read) |
| Real Claude CLI trial | **BLOCKED (not run)** — the only login in the container is the implementation session's own token; using it for product generation would mix the implementation session with prototype jobs and is not the founder's laptop entitlement | this document |
| Codex CLI | **not installed** in the cloud container; official docs (`developers.openai.com`) blocked by the network policy | `which codex`; egress error |
| Codex flags used | `exec --sandbox read-only --skip-git-repo-check --cd <job dir> --output-schema <file> --output-last-message <file> -` — **UNVERIFIED**; preflight refuses to run unless `codex exec --help` lists every one | `src/company-builder/cli/adapter.ts` `REQUIRED_FLAGS` |
| Real Codex CLI trial | **BLOCKED** | — |

Deterministic fake CLIs (`tests/fixtures/company-builder/fake-cli.mjs`) exercise the adapter; they are **not** model
inference.

## Controls implemented (brief §4)

| Control | Implementation |
|---|---|
| Enabled only in private dev config | `FLOWLINE_CB_PROTOTYPE=owner_cli`, and `FLOWLINE_ENV` ∈ {development, test}, and no `FLOWLINE_BETA_MODE` (`gate.ts prototypeConfigProblem`) |
| Server-verified founder + designated workspace | session user id = `FLOWLINE_CB_FOUNDER_USER_ID` **and** workspace id = `FLOWLINE_CB_PROTOTYPE_WORKSPACE_ID`; everyone else gets the same 404 (checked before any role check) |
| Private/loopback only | request host must be loopback with only loopback relay addresses, or an explicitly listed `FLOWLINE_CB_PRIVATE_HOSTS` + `FLOWLINE_CB_PRIVATE_CLIENTS` pair. **Also bind the server to loopback** (`next start -H 127.0.0.1`): the Host header alone is client-supplied |
| Explicit initiation | jobs are created only by the founder's click (`waiting_operator`); nothing in billing, schedules, webhooks or customer input creates one; the shared worker never runs them |
| Typed envelope, opaque id | `envelope.ts` zod union; job id is a UUID; UI sends only `{cli, kind, requestKey, text?}` |
| Fixed executables/args, no shell | `FLOWLINE_CB_CLAUDE_BIN` / `FLOWLINE_CB_CODEX_BIN` absolute paths from operator env; `buildArgs()` fixed arrays; `spawn(…, {shell:false})`; prompt via stdin |
| Separate job dirs, fresh context | `mkdtemp` under `FLOWLINE_CB_JOB_ROOT` (0700), realpath containment, removed after each job; `--no-session-persistence`; Codex `--cd <job dir>` |
| Minimum sanitised data | brief = situation, departments, offering, tools, currencies, approved info — emails/long numbers replaced; no credentials/files |
| No tools / plugins / hooks / MCP / project instructions | Claude: `--tools "" --restricted --strict-mcp-config --mcp-config '{"mcpServers":{}}' --disable-slash-commands`; Codex: `--sandbox read-only`; preflight fails closed (`ISOLATION_UNVERIFIED`) if `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md` or any `CLAUDE.md`/`AGENTS.md` above the job root exists |
| No root/Docker/shell/external writes | no tools at all for Claude; read-only sandbox for Codex; child env is minimal (no `DATABASE_URL`, auth secrets, Flowline keys, API keys) |
| Bounds | 64 KB output, timeout (default 180 s, max 600 s), 1 generation + max 1 schema repair, one job at a time; process group killed on timeout/cancel |
| Durable state, cancel, cleanup | `cb_cli_job` statuses; cancel flag polled every 2 s → SIGKILL to the group; stale `generating` jobs → `failed/INTERRUPTED` (never silently re-run) |
| Auth / quota / permission apart | `blocked_auth`, `blocked_quota`, `blocked_permission`; no automatic bypass, account switch or paid fallback (`--fallback-model` never passed) |
| Persist only validated results | proposals can only include/exclude existing task ids and tune `approvedInfo`/`currencies`; result becomes a new blueprint version requiring review; raw transcripts, session ids and reasoning are not stored; usage = only fields the CLI reported |
| No database writes by the CLI | the CLI returns JSON to the controller; `storeBlueprint()` validates and writes |

Truthful states shown: waiting for operator, generating, validating, review required, completed, cancelled, failed,
blocked (sign-in / usage limit / permission).

## Founder runbook (laptop)

1. Start the app bound to loopback with the prototype enabled (in your private `.env`, never committed):
   ```bash
   FLOWLINE_COMPANY_BUILDER=on
   FLOWLINE_CB_PROTOTYPE=owner_cli
   FLOWLINE_CB_FOUNDER_USER_ID=<your user id: select id from "user" where email='<you>';>
   FLOWLINE_CB_PROTOTYPE_WORKSPACE_ID=<the synthetic workspace id>
   FLOWLINE_CB_CLAUDE_BIN=/absolute/path/to/claude      # `command -v claude`
   FLOWLINE_CB_CODEX_BIN=/absolute/path/to/codex        # `command -v codex`
   ```
   `pnpm db:migrate && pnpm build && npx next start -H 127.0.0.1 -p 3000` (plus `pnpm worker` in a second terminal).
2. Sign in to each CLI with its **official** login yourself (`claude` → `/login`; `codex login`). Flowline never asks for
   or reads these credentials. Check: `claude auth status`, `codex login status`.
3. Make sure no personal instruction files would be inherited (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`), or move
   them aside for the session — preflight refuses to run otherwise.
4. Start the controller: `node scripts/with-env.mjs .env npx tsx scripts/company-builder/cli-controller.mts`.
5. Open `http://localhost:3000/w/<slug>/company/<session>` → "Refine the plan with Claude/Codex" → the job goes
   waiting → generating → validating → review required; review the new plan version before approving it.
6. Stop the controller with Ctrl+C when done.

### Laptop-only CLI (e.g. Flowline on the Pi)

Export the envelope from the job ("Export for the laptop"), then on the laptop:
```bash
FLOWLINE_CB_CLAUDE_BIN=$(command -v claude) npx tsx scripts/company-builder/laptop-generate.mts envelope.json result.json
FLOWLINE_CB_CODEX_BIN=$(command -v codex)   npx tsx scripts/company-builder/laptop-generate.mts envelope.json result.json
```
Import `result.json` on the same job ("Import the result"). The import is validated exactly like controller output and
its provenance is recorded as an **imported claim** (Flowline can't verify where it was generated). No remote shell
bridge exists.

## Remaining owner checks (BLOCKED here)

- Real Claude CLI blueprint + text trial on the laptop (commands above). Record `claude --version`, the model the CLI
  reports (`modelUsage` keys), `total_cost_usd` if reported, and whether `--json-schema` produced `structured_output`.
- Install Codex CLI on the laptop; run `codex exec --help` and confirm every flag in `REQUIRED_FLAGS.codex`; then the
  same two jobs. If a flag is named differently, preflight reports `CLI_FLAG_UNSUPPORTED` — update the adapter, don't
  bypass preflight.
- Confirm usage rights under your plans' terms for this founder-only experiment (https://code.claude.com/docs/en/legal-and-compliance,
  https://developers.openai.com/codex/auth/). This is an owner decision; nothing here assumes it.
