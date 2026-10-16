# Codex: design-v2 visual review against the approved design reference (independent reviewer)

You review screenshots of the running app against the approved design. This is a **visual comparison**, not
functional QA, which is a separate run.

## Rules
- **Do NOT modify product code, tests, baselines or reference images.** Write only under
  `artifacts/design-v2/visual-review/`, and append real defects to `artifacts/design-v2/BUGS.md` as `DV2-Vnn`. Don't
  commit.
- **Secrets:** never read or print `.env*` files. No secrets in screenshots.
- **One browser session at a time.** Don't start or stop servers.
- **Check first** that you can actually view image files with your tools. If you can't, stop and record the exact
  limitation in `REPORT.md`. Don't guess at what an image contains.

## What "approved" means (important)
- **The reference:** `design-reference/slides/slide-01…16.png` and `design-reference/DESIGN-REFERENCE.md` (tokens, per-slide
  notes). This is the v1 dark design.
- **Changes the owner approved for design-v2**, which are intentional and not defects in themselves:
  1. **Colour:** a more colourful palette refresh. The brand fill stays `#7C6CFF`, and the category hues are more vivid.
  2. **Light theme:** a light theme plus Light/Dark/System switching. The deck has no light screens, so judge light for
     internal consistency and legibility.
  3. **Motion:** clear, short feedback motion on actions (≤300 ms), and Apple-style scroll motion on the public pages
     only. Everything is static under reduced motion.
  4. **Design system:** layered tokens (primitive → semantic) and a component library. `docs/design-system/README.md`
     describes it.
  5. **Accessibility:** the text/badge colours were adjusted to meet WCAG AA contrast. A separate `accent-text` token is
     lighter in dark mode and darker in light mode.
- **Unchanged expectations:** layout, information structure, typography scale, spacing rhythm, component anatomy,
  states (empty / loading / error / disabled-with-reason), dialogs, and the RTL mirroring (Arabic is the default
  language).

## Method
1. **Browser:** open real Google Chrome with Playwright `channel: "chrome"`, headless or headed (record which), using a
   fresh temporary profile under `artifacts/design-v2/visual-review/.profile/`, deleted at the end. Target
   `http://localhost:3100`, a production build of the snapshot `checkpoint 4 = `refs/checkpoints/design-v2-closeout-4` → `85516ef` (tree `435c3db`); the working tree of branch `design-v2` (HEAD `fb563e5` + uncommitted changes identical to checkpoint 4); production build BUILD_ID `9GR7x_ACnOcU1IqjUYMCL``; record `.next-test/BUILD_ID`. Sign up
   synthetic `@flowline-qa.test` accounts via the UI (outbox: `curl "http://localhost:3100/api/test/outbox?email=<address>"`).
   Seed realistic states through the UI; test doubles are allowed.
2. **Capture** the screens that match the deck: landing (5), auth/onboarding (6), dashboard (7), builder canvas (8), run
   inspector (9), integrations (10), templates (11), settings (12), state examples (13), responsive (14).
   - Capture each at 1440, and the main ones at 1024 and 375.
   - Do it in the dark theme (for comparison with the deck) and the light theme, and in English and Arabic for at least
     the landing, dashboard, builder and settings pages.
   - Save them to `artifacts/design-v2/visual-review/screenshots/<screen>-<theme>-<lang>-<width>.png`.
3. **Compare application regions only.** Ignore the slide borders, titles, annotations and presentation chrome in the
   deck images. For each screen, compare:
   - layout and grid;
   - typography (families, sizes, weights, line heights);
   - spacing;
   - colours (roles, not exact hex, given item 1 above);
   - component anatomy, including states and dialogs;
   - RTL mirroring;
   - responsive behaviour;
   - motion, where observable: record what you saw with motion on and with reduced motion.
4. **Classify each difference:**
   - **Intentional (approved):** name which approved change explains it.
   - **Defect:** filed as `DV2-Vnn` in BUGS.md, with severity P0–P3, classification, reproduction, expected (reference
     region) vs actual (screenshot), the snapshot/BUILD_ID, and evidence paths.
   - **Unclear:** state it plainly for the owner to decide.

## Report
`artifacts/design-v2/visual-review/REPORT.md` containing:
- the environment and tools, including how you viewed the images;
- a per-screen table: reference slide / screenshot(s) / matches / intentional differences / defects / unclear;
- an overall verdict;
- an explicit list of what was not reviewed.

## Already known (do not file duplicates)
The functional QA on the same snapshot found DV2-Q01…Q05 (see `artifacts/design-v2/BUGS.md`): English generated run
messages in Arabic, dialog return focus, the English header overflow at 768 px, missing phone language/theme controls
on the landing page, and a non-modal mobile run sheet. Fixes are in progress. If you see them, reference the existing ID
in your table instead of filing a new one.
