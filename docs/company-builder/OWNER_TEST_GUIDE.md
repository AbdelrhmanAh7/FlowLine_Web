# Company Builder — owner test guide

## Start (local, no API key, no payment)

```bash
# once: Postgres on 127.0.0.1:5433 (pnpm db:up, or a local PostgreSQL), then in .env add:
#   FLOWLINE_COMPANY_BUILDER=on
pnpm install
pnpm db:migrate
pnpm dev            # web on http://localhost:3000 + worker
```
Sign in (or sign up and verify through the outbox), open **Digital team / فريقك الرقمي** in the sidebar, or go to
`http://localhost:3000/w/<workspace-slug>/company`.

## First complete journey (≈10 minutes)

1. **فريقك الرقمي → اقترح فريقي.** Answer: situation "I'm improving an existing company"; describe the business, e.g.
   "We run an office cleaning company and answer customer requests by email".
2. Notice the next question is pre-filled with an **inference** ("We inferred this from your description") — confirm it.
3. Answer channel (Email), reviewer (Me), team size. **Reload the page**: you resume at the next question; the
   answered count is kept and there is no fixed "x of N".
4. Press **Back**, re-answer, continue: tools, next step, the **approved information** (prices/delivery), and
   "I don't know yet" for other areas.
5. In **Review what we understood**, edit one fact → it shows *You corrected it · Version n*.
6. **Show my plan** → read the roles, what each task does, access needed ("We need to connect Gmail to run …"),
   reviewer, usage, unavailable capabilities and blockers. The draft notice says nothing runs automatically.
7. **Approve the plan → Create the drafts.** Open **Open in the editor**: a real flow in the existing canvas. The
   bounded agent appears under Agents (it needs an AI connection to run — shown as "Requires setup").
8. **Try with sample data** on *Customer request triage*: a real run; the card shows *Structure valid / Ran without
   errors / Result matches* separately, the checks, and the provenance "Rule-based calculation (no AI)".
9. **Send the test action for review** → the **Review inbox** shows source, proposed reply, connection (local test
   outbox), recipient, reviewer and task version → **Approve** → Done; the test outbox lists it.
10. **Start a development trial** (labelled: not a paid subscription) → **Request activation** → approve it in the inbox
    → the task becomes **Active** (published with a manual trigger; nothing runs unattended). End the trial → the task is
    paused automatically.
11. Try the invoice task: the sample contains one deliberate discrepancy — it goes to review; totals are per currency.

Things to try to break: change an answer after approving a review (the pending item becomes "No longer valid");
edit the draft flow and run the trial again (a wrong reply fails "Result matches"); open the same session in two tabs
and answer in both (the second gets a clear conflict message); switch to Arabic (default) and check RTL.

## What is NOT in this build

Real Gmail/Sheets sending (drafts show the connection needed; trials never touch your accounts), OCR, image/design
output, recruitment tasks (planned only), real CLI generation (owner-only; see `CLI_PROTOTYPE.md`), live payments.

## 5-person usability protocol (owner-run) — status: NOT RUN

Participants: 5 people who run or are starting a small business (≥2 Arabic-first), no Flowline experience. Each
session 30 minutes, screen shared, think-aloud, owner observes without helping.

| # | Task | Success criterion | Record |
|---|---|---|---|
| 1 | "Describe your business and get a plan" | reaches the plan without help | time, questions confusing, drop-off point |
| 2 | "Find what the plan could NOT do for you" | names ≥1 blocker/unavailable item correctly | correct / incorrect |
| 3 | "Correct something we misunderstood" | edits a fact and sees the new version | yes / no |
| 4 | "Try a task with sample data and tell me if it worked" | distinguishes 'ran' from 'result matches' | quote |
| 5 | "Would anything be sent to your customers now?" | answers "no" and says why | quote |
| 6 | Arabic wording | points out any unclear sentence | list |

After each session: SUS-style 1–5 rating for clarity and trust, top 3 issues. Results go to
`artifacts/company-builder/<run-id>/usability/` (no personal data, no screenshots with real business data).
Agent QA is **not** human usability evidence.
