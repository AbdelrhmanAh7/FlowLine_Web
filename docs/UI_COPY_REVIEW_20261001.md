# Bilingual copy review — 2026-10-01

This is a bounded source review of the Arabic/English message inventory and representative wording by product category. It is not a manual review of every rendered route or a claim that every feature is production verified.

## Evidence and coverage

- Final automated inventory: `artifacts/phase-4/ui-copy-20261001/catalogue.tsv` contains 3,475 keys in each language; `audit.json` reports no structural catalogue issues across 113 scanned source files. Includes the translated design guide and ZITADEL setup.
- Reviewed wording categories: landing/navigation, metadata, authentication, billing, builder/node descriptions, AI-provider notices, agents/knowledge, integrations/administration, and company-builder planning/activation. Reviewed suspicious claims and terminology in the inventory; this does not mean all 3,475 translations received individual linguistic approval.
- No browser interaction was performed by this reviewer. Responsive wrapping, keyboard labels, screen-reader output, Arabic plurals in context, and scroll/click behavior need rendered evidence from the coordinating session.
- Localized the internal design-system guide, including example labels, dialogs, motion explanations, status text and accessibility labels. Technical token names, CSS classes, component names, protocol examples and brand names remain literal. The guide no longer labels dark as the default.

## Terminology decisions

| Concept | Arabic | English | Placement |
| --- | --- | --- | --- |
| Workflow | سير العمل | Workflow | Explanations and onboarding |
| Workflow list item | سير عمل | Workflow | Navigation and list labels; avoid switching to المسار unless referring to a branch |
| Branch/path | مسار | Path | Conditional routing |
| Run | تشغيل | Run | Execution action and history |
| Lead | عميل محتمل | Lead | Lead intake; a lead is not yet a customer |
| Enquiry | استفسار | Enquiry | Incoming request when the example actually processes an enquiry |
| Agent | مساعد ذكي | AI helper | Introductory product language; وكيل is acceptable in advanced configuration |
| Connection | اتصال | Connection | Provider account setup |
| Verified live | تم التحقق في استخدام فعلي | Verified live | Only with provider-backed evidence |

Use task verbs for buttons (حفظ / Save, تشغيل / Run), a concrete benefit for headings, and the prerequisite or failure recovery next to the affected control. Keep JSON, webhook, issuer and model identifiers in technical configuration; explain their purpose before presenting syntax. Do not translate protocol names or invent model names.

## Concrete issues to resolve or verify

1. Resolved: landing trigger wording was semantically inconsistent: `heroNodes.trigger`/`flowNodes.trigger` says وصل عميل جديد in Arabic, New lead arrives in English, while `flowDetails.t` describes an enquiry. Choose the actual illustrated event and align all three; an enquiry-based demo should say وصول استفسار جديد / New enquiry arrives.
2. Workflow terminology alternates between المسارات and سير العمل in navigation/metadata versus explanations. Consolidate gradually using the table above, preserving مسار for a conditional branch.
3. Resolved: `agents.form.instructionsHint` and `knowledge.addBody` make absolute claims that instructions inside documents can never override or be followed. Describe intended treatment and enforced permission checks; prompt-injection resistance must not be presented as a universal guarantee. Coordinator is handling this wording.
4. Resolved: `landing.templatesBody` promises immediate operation without setup. Confirm every advertised template uses sample data and requires no external credentials; otherwise qualify the affected template. Current adjacent count text already distinguishes sample data and no messages.
5. Free beta wording must stay beside the preview qualifier. The pricing paragraph correctly says external AI/apps may have their own costs; do not turn this into a universal zero-cost guarantee.
6. Provider pricing, quotas and legal notices are time-sensitive. Existing catalogue values need periodic official-source verification; this review does not certify their current commercial accuracy.
7. Literal inventory mostly contains legitimate brands, email/domain examples, shortcuts and technical syntax outside the guide. These must remain LTR. Context still needs checking for `Del` and platform shortcut rendering, and for syntax examples that need surrounding translated explanations.

Arabic and light defaults must be checked with fresh browser storage, then after explicit language/theme choices. Metadata and visible copy should share the request locale. Search keywords are descriptive terms, not a substitute for useful headings, titles and descriptions.

