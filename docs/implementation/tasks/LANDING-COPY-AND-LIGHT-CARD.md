# Owner request (2026-09-30): make the landing page easy to understand, and fix the hero card in the light theme

For the Codex executor. It is in scope under BETA_EXECUTION_BRIEF.md §6 (usability for private beta; no redesign).
Coordinator: Claude. Keep all the brief's rules. Change nothing outside the landing page, its i18n keys and the tests
that pin them.

## Problem 1: the copy is hard to read (EN and AR)
- The illustrations show internal engine labels under each step: `TRIGGER · MANUAL`, `TRANSFORM · JSONATA`,
  `LOGIC · IF / ELSE`, `AI · STRUCTURED JSON`, `OUTPUT · RESULT`. Visitors see "JSON" and don't understand it. These
  come from `nodeText(t, <type>, "subtitle")` in `src/app/page.tsx` (hero `HeroFlow` and the `FlowScene` nodes).
- Jargon elsewhere: "local nodes", "Normalise lead", "graph", "agents", "No roadmap promises", "exactly like the real run
  inspector", and so on.

### Fix
1. **Illustration labels:** in the landing illustrations only, replace the engine subtitles with plain-language
   landing-specific i18n keys, e.g. `landing.heroNodes.*Sub` and `landing.flowNodes.*Sub`. Keep the dot colour driven
   by the real category (`CATEGORY_HUE`). **Don't change** the canvas/product node catalogue (`nodes.*.subtitle`),
   which the app itself uses.
2. **Plain copy:** rewrite ALL `landing.*` strings in plain, friendly language for non-technical visitors: short
   sentences, no JSON/JSONata/graph/node/agent jargon, product names like Copilot and Google Sheets kept. Arabic is
   the source of truth: natural, simple Modern Standard Arabic, not a literal translation. Identical keys in `ar.ts`
   and `en.ts`. **Stay honest:** keep "preview", "Copilot is experimental", and pricing not announced; don't invent
   claims.

   Suggested copy (adjust for flow and length; must still fit the cards at 360–1440 px):

   | Key | English | Arabic |
   |---|---|---|
   | hero node 1 title / sub | New lead arrives / Starts the flow | وصل عميل جديد / يبدأ سير العمل |
   | hero node 2 title / sub | Tidy up the details / Cleans the data | ترتيب البيانات / ينظّف المعلومات |
   | hero node 3 title / sub | Big company? / Chooses the next step | شركة كبيرة؟ / يختار الخطوة التالية |
   | flow nodes (5) | New lead arrives · Tidy up the details · Big company? · AI adds details · Save the result | وصل عميل جديد · ترتيب البيانات · شركة كبيرة؟ · الذكاء الاصطناعي يُكمل البيانات · حفظ النتيجة |
   | flow node subs | Starts the flow · Cleans the data · Chooses the path · Uses AI · Shows the outcome | يبدأ سير العمل · ينظّف المعلومات · يختار المسار · يستخدم الذكاء الاصطناعي · يعرض النتيجة |
   | badge | ✦ Preview · free during the beta | ✦ نسخة تجريبية · مجانية خلال الفترة التجريبية |
   | heroBody | Build automations by connecting simple blocks — no code. Every step is saved, so you can see exactly what happened. | أنشئ عمليات تلقائية بتوصيل خطوات بسيطة دون أي برمجة، وكل خطوة محفوظة لترى ما حدث بالضبط. |
   | templatesBody | Ready-made examples you can run right away — no setup needed. | أمثلة جاهزة يمكنك تشغيلها فورًا دون أي إعداد. |
   | pricingBody | Pricing isn't announced yet. During the preview, building and running flows is free. | لم تُعلن الأسعار بعد، والبناء والتشغيل مجانيان خلال الفترة التجريبية. |
   | featuresBody | Four things you can do in Flowline today. Copilot is still experimental. | أربعة أشياء يمكنك فعلها في Flowline اليوم، وما زال Copilot تجريبيًا. |
   | scenes.copilot.body | Describe what you want in one sentence. Copilot builds the steps for you, and you check them before anything runs. | صِف ما تريده بجملة واحدة، فيبني Copilot الخطوات وتراجعها أنت قبل أي تشغيل. |
   | scenes.agents.title / body | AI helpers inside your flows / Give an AI helper a goal and your documents. It works as one step, and you can see everything it did. | مساعدون أذكياء داخل سير العمل / امنح المساعد هدفًا ومستنداتك، فيعمل كخطوة واحدة وترى كل ما فعله. |
   | scenes.knowledge.body | Upload your documents so flows answer from your own information. | ارفع مستنداتك لتجيب عمليات سير العمل من معلوماتك أنت. |
   | scenes.integrations.body | Connect the apps you already use. Each app shows whether it really works — nothing is claimed before it's checked. | اربط التطبيقات التي تستخدمها، وسيظهر لكل تطبيق هل يعمل فعلًا دون أي ادعاء قبل التحقق. |
   | flowSceneBody | Scroll to watch each step light up as the flow runs. | مرّر لترى كل خطوة تضيء أثناء تشغيل سير العمل. |

## Problem 2: the hero card background is wrong in the light theme (fine in dark)
- **Cause:** `src/app/page.tsx` (~line 125) uses `bg-app` with a dot grid drawn in `var(--color-elevated)`, and the node
  cards use `bg-card`. In the light theme, elevated, card and surface are the same near-white, so the dots vanish and
  the cards blend into the background.
- **Fix:** use the canvas tokens the builder already uses: the `--canvas-dot` dot colour, and a card/border/shadow
  pairing that separates the node cards from the board in BOTH themes, e.g. the board on `bg-surface` or `bg-app`
  with `--canvas-dot` dots, and the nodes on `bg-elevated` with `border-line-strong` plus a subtle shadow. Semantic
  tokens only (the design-system guard stays green). Check the same pattern on the FlowScene cards.
- **Verify** both themes, EN and AR, at 360, 768, 1024 and 1440, with screenshots, and that dark still looks as it does
  now.

## Tests
- `tests/unit/design-system.test.ts` currently pins "landing illustrations take subtitles from `nodeText`" (count 5 + 3)
  and the hero category hue.
  - Update it to the new, owner-requested intent: landing illustration subtitles come from `landing.*` i18n keys, with
    no engine jargon (assert that no `JSONATA|JSON|IF / ELSE|TRIGGER ·` appears in `landing.*` in either locale), and
    the dot colour is still from `CATEGORY_HUE`.
  - Record the reason in `artifacts/design-v2/NOTES.md` §6 (deliberate change; supersedes the DV2-V02 approach for the
    landing page only).
- Run `e2e/landing.spec.ts`, `arabic.spec.ts` and `hydration.spec.ts`, and grep `e2e/` for any old landing strings
  first.
- Then the normal low-memory gate for affected specs. Include this in the next checkpoint and in the Chrome
  exploration of journey 1.
