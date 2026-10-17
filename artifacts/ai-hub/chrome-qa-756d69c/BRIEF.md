# Codex: AI hub exploratory QA in real Google Chrome (Wave C, step B)

You are an **independent tester**. Call this **agent-driven exploratory testing** (not human UAT).
- **Do NOT modify product code.** Write only under `artifacts/ai-hub/chrome-qa-756d69c/`.
- Do not commit. Do not start, stop or rebuild servers or containers.

## Target
- **Stack:** `http://localhost:3100`, the test stack (`FLOWLINE_ENV=test`, Next dev server + worker) running the
  final candidate `ai-hub` @ `756d69c`. Its product code is identical to `a0b92df`. Check `GET /api/health` first; it
  reports `revision: "dev"` on this stack, so record the SHA from `git rev-parse HEAD` in this worktree.
- **Providers are TEST DOUBLES**, not real clouds:
  - the OpenAI-compatible fake on `:4011`;
  - native-protocol fakes for Anthropic/Gemini/etc. behind the same fake server;
  - SaaS fakes on `:4010`.

  The AI Providers page shows a "test double" notice. Any key string works (e.g. `sk-fake-qa-<random>`). **Never
  present results as live cloud verification.**
- **Accounts:** sign up through the UI with `@flowline-qa.test` addresses (password e.g. `Codex-QA-Pass-5`). Email
  verification links are in the test outbox:
  `curl "http://localhost:3100/api/test/outbox?email=<address>"` (test stack only).
- **Test controls you may use:**
  - fake faults: `POST http://127.0.0.1:4011/__fake/openai/fault` with `{"mode":"401"|"429"|"500"|"timeout","times":1}`;
  - `/__fake/hub/fault`;
  - request logs: `GET http://127.0.0.1:4011/__fake/openai/requests`.

  Say whenever you used them.

## How
- **Browser:** real Google Chrome via Playwright `channel: "chrome"`, or the available browser tools. Verify the
  browser really is Google Chrome and record its version. If only Chromium is available, record the substitution and
  mark Chrome-specific verification PENDING.
- **Drive the UI like a user.** API calls are allowed only for read-only checks and the fake controls above.
- **Watch** the console (errors, hydration warnings) and network (4xx/5xx).
- **Layouts:** 1440, 1024 and 375 px, in Arabic (default, RTL) and English.
- **Screenshots** go in `screenshots/`. Never capture a full API key: blur it or keep it out of frame.
- **One browser session at a time.**

## Journeys (each PASS / FAIL / BLOCKED with evidence)
1. **Connect:** Settings → AI Providers → Add connection (OpenAI) → name + key → Check and save → discover → search
   models. The key is shown only masked afterwards: check the API responses, page HTML, localStorage /
   sessionStorage / IndexedDB and URLs for the raw key.
2. **Two workflows, two models:** create two workflows with AI steps and pick different models (e.g. one from OpenAI,
   one from a second provider connection such as Anthropic) with the model picker. Run both, then inspect the actual
   output, provider, model, tokens and cost (known / estimated / unknown shown honestly) in the run inspector.
3. **Agent with tools:** create an agent with a model route and an ASK tool. The tool call pauses for approval, the
   owner approves, and it runs once.
4. **Copilot:** request a workflow, then preview/diff, approve, and confirm it is saved as a draft only. The wording
   must not claim semantic correctness.
5. **Invalid key:** make the fake return 401 on a key test or a run. There must be a clear error, no fallback to
   another key, and no fake success.
6. **Rotation / revocation:**
   - Replace the key, with the affected-items preview shown first; the next run uses the new key (check the fake's
     request log hash if useful).
   - Disconnect; runs using it fail clearly.
7. **Allowed fallback:**
   - Set a FALLBACK policy with a second connection.
   - Force the primary to fail with a retryable error (500/429).
   - The fallback answers, and the run meta shows the route used and why.
8. **FREE_ONLY refusal:** set a FREE_ONLY policy. A paid or unknown-price route is refused with a clear reason, and
   nothing is sent.
9. **Second-workspace isolation:** an outsider in another workspace cannot see or use the first workspace's
   connections (404s). An editor without use rights can't pick the connection.
10. **Usage history:** usage and cost appear in settings usage and the run inspector, and are consistent.
11. **Platform admin panel (credentials in the UI):**
    - Get a setup code by running `node scripts/with-env.mjs .env.test npx tsx scripts/admin/bootstrap.mts --email <you>`
      (add `--grant` if first-admin setup was already completed on this DB). That's the operator step.
    - Redeem it at `/admin/setup`, enrol TOTP (compute codes with `e2e/tools/totp.ts`), step up, save a write-only
      credential, and confirm it's never shown back.
    - A non-admin gets 404 on `/admin`.

## Report
- `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`: environment (the Chrome version, the SHA, the date), a journey
  table, coverage, and the console/network error inventory.
- `artifacts/ai-hub/chrome-qa-756d69c/BUGS.md`: every finding as `CXQ-NN` with:
  - severity P0–P3 (P0 = security / tenancy / data loss / money; P1 = a core journey broken or a misleading claim;
    P2 = degraded with a workaround; P3 = cosmetic);
  - exact reproduction steps, expected vs actual;
  - the tested SHA and sanitised evidence.

No secrets, full keys, passwords or TOTP secrets in any file.
