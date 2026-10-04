# Company Builder — copy review

Source catalogue: `src/i18n/messages/ar.json (companyBuilder namespace)` (Arabic, source of truth) and
`src/i18n/messages/en.json (companyBuilder namespace)` (same keys, catalogue parity checked). Every visible string of the new screens is a
catalogue key with a display condition in the component that renders it. Model/CLI output never supplies product
copy: generated content is shown only as quoted data (reply drafts, copy options), escaped by React.

**Supplied UX copy catalogue (`Flowline_Virtual_Company_UX_Copy_AR.json`): NOT SUPPLIED** — source copy ids are
PENDING. The required sentences from the brief (§5, §8) are used verbatim and locked by `tests/unit/company-builder.test.ts`
("copy contract").

**Reviewer:** Claude (implementer), self-review pass 1 on 2026-09-30, plus the separate reviewer agent's pass (see
`REPORT.md`). Neither is a native-speaker or human usability review; **human Arabic copy review: NOT RUN.**

## Review criteria applied to every sentence

Necessity (does the owner need it here?) · clear action · consequence · uncertainty stated · recovery path ·
no invented pricing, privacy, security, savings, "replaces staff", "unlimited" or success wording (banned-phrase test).

## Screens and critical states

| Screen / state | Keys | Display condition | Notes / revisions |
|---|---|---|---|
| Landing | `promise`, `supporting`, `start`, `limits`, `advanced` | feature on | Required sentences verbatim. `limits` added: no incorporation, no replacing staff, no autonomous operation. Start disabled with `disabledViewer` for viewers. |
| Question | `q.<id>.title`, `q.<id>.reason` (under "Why we ask"), `opt.*`, `interview.*` | server-selected question | Reason text for every question states why it changes the plan. "لا أعرف بعد" only where `allowUnknown`. No fixed total: `interview.answered` plural (Arabic 6 forms). |
| Inference | `interview.suggested` | fact status `inferred` | Says it is inferred and needs confirmation (never shown as a fact). |
| Contradiction | `interview.conflict`, `facts.conflict.*` | status `contradictory` | Names the conflicting answers; asks to clarify, no guess. |
| Sensitive | `interview.sensitive` | financial/personal questions | Data minimisation prompt. |
| Two tabs | `interview.conflictTab` | 409 REVISION_CONFLICT | Says what happened + what to do. |
| Facts review | `facts.heading` ("راجع ما فهمناه عن مشروعك."), `facts.status.*`, `facts.source.*`, `facts.version` | ≥1 fact | Status + provenance + version on every fact. |
| Plan | `plan.ready` / `plan.partial`, `plan.draftNotice` ("هذه مسودة. لم يبدأ أي تشغيل تلقائي."), `plan.generator.*`, `plan.sampleData`, `plan.diff*` | plan exists | Partial plan is labelled partial; generator is disclosed (rules vs CLI vs import). |
| Blockers | `blocker.*` | per blocker | Each says what's missing/unsupported and the safe alternative (e.g. upload instead of Drive, text instead of images). |
| Task details | `label.*`, `task.<id>.*`, `justification.*`, `triggerKind/Status.*`, `reviewerRole.*`, `usage.*`, `unavailableCap.*`, `capability.*`, `connectionNeeded` ("نحتاج ربط {service} لتشغيل {task}.") | each task | Usage says "Uses no AI models" or "Unknown" — never an invented estimate. Service names are real provider names. |
| Install | `plan.installed/installFailed/installCancelled/installing` | installation status | Failure copy tells the owner a retry won't duplicate. |
| Task states | `state.*`, `reason.*` | per task | "Didn't pass" instead of "Failed" to avoid blaming; reasons are specific. |
| Trial | `trial.sampleNotice` ("تجربة ببيانات نموذجية — لم نتصل بحساباتك"), `trial.finished` ("اكتمل التشغيل. راجع النتيجة."), `trial.structurallyValid/ranWithoutErrors/matchedOutcome`, `trial.notMatched`, `trial.check.*`, `trial.provenance.*` | trial exists | The sample notice is shown only on trials, which never use a connection (always true there). Success is never inferred from exit status; three verdicts shown separately. |
| Review inbox | `review.*` | installed | Connection line says the test outbox sends nothing externally. `review.uncertain` = "لم نتمكن من تأكيد الإرسال. نتحقق قبل إعادة المحاولة." |
| Activation | `activation.*`, `entitlement.*` | installed | States that paying alone never activates, and the dev trial is not a paid subscription. |
| Prototype | `prototype.*` | founder only | Labels: owner only, processed by cloud AI services, never for customers; usage = "Reported by the CLI" or "The CLI reported no usage". |
| Errors | `errors.*` | API error codes | Generic error says nothing changed (true: all mutations are transactional). |

## Revisions made during review

1. `opt.other` renamed to `something_else` / `other_currency` / `other_tools`: a key named `other` was misread as a
   plural form by the catalogue type — and one "Other" label was ambiguous across questions.
2. Removed any wording implying the plan "runs your business"; `limits` sentence added to the landing.
3. `state.failed` → "لم ينجح / Didn't pass" (describes the result, not the person).
4. Blocker for unverified tools says to treat them as unsupported until confirmed (no optimistic claim).

## Direction and formatting checks

Arabic default (RTL) and English (LTR) — E2E `company-builder.spec.ts` (Arabic test + English journey). Emails,
URLs, JSON and task versions are rendered `dir="ltr"`; free text `dir="auto"`. Currency amounts in outputs are shown
per currency (never summed across currencies). Dates use the existing locale formatter (`formatDate`), with the
workspace timezone not reinterpreted.

## Direction v2 pass (2026-09-30, outcome first)

**Reviewers:**

- Claude (the implementer): self-review of every new key.
- A Chromium exploratory pass in Arabic. This substitutes for real Google Chrome, which the network policy blocks.
- An independent Fable review (see `REPORT.md`).

None of these is a native-speaker or human usability review; **human Arabic copy review: NOT RUN.**

**Criteria added:**

- Business language only outside *Advanced*. No "node", "schema", "orchestrator", "runtime" or "provider" in the main
  path: the plan shows steps by their business names, and the kind of task, capabilities and limits sit under
  "Technical details (advanced)". The workflow link reads "Advanced: open the workflow".
- Never "Your company is running". This is asserted by E2E.
- Honest states only, using the required sentences below.

| Screen / state | Keys | Display condition | Notes |
|---|---|---|---|
| First question | `q.offering` ("What is the first result you want to improve?…") | always first | Outcome first. The "why we ask" says nothing counts as a fact until confirmed. |
| Closest outcome | `q.first_outcome`, `opt.<department>` | always | Explains that one useful result comes first. |
| Details / services / volume | `q.cust_details`, `q.cust_services`, `q.cust_volume`, `opt.detail_*`, `opt.under_20…` | customer outcome | Option ids that clash with other questions have their own copy ids (`optionCopyId`). |
| Other areas | `q.other_areas` | last | Revised: "We list them as possible next improvements only. Nothing is prepared or turned on for them now." |
| Plan sections | `planSection.*` | plan exists | The required sentences are used verbatim: "Ready to configure." / "Needs Gmail connection." (`needsConnection` {service}) / "Uses sample data until you connect your account." / "Requires approval before sending." Nothing "running". |
| Role limits | `doesNot.*` | per role | Each role states what it never does: send without approval, quote unapproved prices, make legal commitments, move money… |
| Who does what | `work.automated/assisted/human`, `work.item.*` | per task | "Done automatically" / "Prepared for your review" / "Stays with a person". |
| Cost | `cost.*` | plan exists | AI: "No AI models: fixed rules only, so no AI cost." External services are the person's own account; the service's own limits and prices are "we don't know them". Runs are shown as a range from the stated volume, otherwise "unknown until you tell us". The price is on the Billing page, and no payment is needed for the sample trial. |
| Next improvements | `next.*` | plan exists | "Not prepared or turned on. Add them later if you want." No buttons (E2E asserts 0). |
| Result | `result.*` | completed trial | The reply is quoted with the recipient shown LTR; the details still to ask for; the hand-off reason; "treated as data only" for suspicious text; the follow-up time with an **explicit time zone**, or "No received time, so no follow-up time was set." |
| Acceptance | `trial.acceptQuestion` ("Does this result match what you wanted?"), `acceptYes/No`, `rejectWhy`, `rejectReason.*`, `rejectConfirm`, `acceptedByYou/rejectedByYou`, `acceptNote` | ran without errors | `acceptNote`: "Your answer doesn't prove every detail is right; the checks above are independent of it." |
| States | `reason.result_review_needed`, `reason.result_rejected`, `errors.RESULT_NOT_ACCEPTED` | objective checks passed, not accepted | Activation is refused with a plain reason. |
| Trial finished | `trial.finished` (EN "Ran without errors. Review the result.") | trial completed | Revised from "The run finished": it now says what is true (no errors) without implying the result is correct. The Arabic source sentence "اكتمل التشغيل. راجع النتيجة." is kept verbatim (brief requirement, copy contract). |
| Experiment (internal) | `experiment.*` | `FLOWLINE_CB_EXPERIMENT=on` only | "We measure time and steps only, not answer text or customer data. The targets are research targets, not claims." |

**Found and fixed during this pass:**

| ID | Problem | Fix |
|---|---|---|
| CB2-03 | Other-areas copy | Rewritten, see the table above. |
| CB2-04 | Hard-coded units and currency | Moved into i18n and `Intl`. |
| EX-01 | Raw ids on screen | Fixed; a unit test now covers every plan item. |
| EX-03 | Broken approval line | Split into two lines. |

EX-02 (mixed digit styles in interpolated numbers) is open; see `artifacts/company-builder/BUGS.md`.

## Number style (owner decision 2026-10-01)

**Digits are always 0–9 across Flowline, including the Arabic UI.** Arabic text and the RTL layout are unchanged.

| Value | Arabic UI example |
|---|---|
| Times | 09:30 |
| Versions | الخطة — النسخة 3 |
| Run numbers | التشغيل #1284 |
| Currency | 250 EGP (the amount and the currency code stay together; amounts in different currencies are never added) |
| Percentages | 12.5% |
| Phone numbers | +20 10 1234 5678 (shown as written; compared without separators) |
| IDs and technical metrics | 0–9 |

**Rules:**

- Every formatter uses `intlLocale("ar")` = `ar-EG-u-nu-latn`. The follow-up time adds the Gregorian calendar and
  names its time zone.
- No component may request `nu-arab`, `nu-arabext` or `nu-persian`.
- No product copy may contain ٠–٩ or ۰–۹.
- Text a person typed is quoted exactly as written. For example, the owner's approved information may contain ٣٠٠,
  and replies send it verbatim. Incoming text with Arabic-Indic or Persian digits is normalised **for comparison only**.

**Locked by:**

- `tests/unit/latin-digits.test.ts` (formatters, banned numbering systems, digit scan of `src/`);
- `tests/unit/cb-format.test.ts`;
- E2E `company-builder.spec.ts` (Arabic page body).

## Refund / cancellation copy (owner decision 2026-10-01)

| Key | Display condition | Text |
|---|---|---|
| `result.consequential` | a refund or cancellation draft | "Refund or cancellation: a person decides. The draft quotes your approved policy only and promises nothing." |
| `review.consequential` | the review item for that draft | "approving sends only this draft text. No refund or cancellation is made by Flowline." |
| `doesNot.issue_refunds` | role limits | "Never issues or promises a refund or cancellation" |
| `work.item.refund_and_cancellation_decisions` | work that stays with a person | "Refund and cancellation decisions" |

Every refund or cancellation draft also contains the fixed note (ar/en, source `REFUND_NOTE` in `src/company-builder/packs/customer-follow-up.ts`):

- en: "The business owner decides this refund or cancellation request. Nothing has been refunded or cancelled."
- ar: "قرار طلب الاسترداد أو الإلغاء هذا يعود إلى مالك المشروع. لم يتم أي استرداد أو إلغاء."

It names the business **owner** as the decision maker for that specific request (never "a member of our team"), contains no numbers, and promises no outcome: no refund, cancellation or approval is announced or implied. Locked by the unit REF-NOTE test in `tests/unit/cb-pack-customer-follow-up.test.ts`.
