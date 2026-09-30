# Company Builder — copy review

Source catalogue: `src/i18n/messages/company-builder.ar.ts` (Arabic, source of truth) and
`src/i18n/messages/company-builder.en.ts` (same keys, TypeScript-enforced). Every visible string of the new screens is a
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
