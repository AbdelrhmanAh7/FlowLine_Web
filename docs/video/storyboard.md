# Flowline real-world video: storyboard

Status: **storyboard and pipeline ready; final render at the end of the pilot (2026-10-16)**, so the film shows the
finished pilot features. Tracking issue: "Real-world video (pilot deliverable)". Umbrella: #96 (landing demo media,
#99 recording pipeline, #100 landing embed).

This is not a UI tour. It follows one real-looking person with one real problem, shows how Flowline solves it step
by step on the **real UI** (recorded from a production build on sample data by the #99 pipeline), and ends on the
outcome. It is the first half of a two-part story: the same company continues in the Mizano film (see
[integration-story.md](integration-story.md)).

## Deliverables

| Cut | Length | Format | Use |
|---|---|---|---|
| Full story | about 89 s | 1920x1080, 30 fps, H.264 MP4 + WebM, JPEG poster, EN and AR (burned-in text + WebVTT) | landing page, sales calls |
| Short | about 19 s | same | landing hero, social |
| Better together (shared with Mizano) | 30-45 s | same | both landings, after the Mizano pilot (2026-11-02) |

Acceptance limits (#137, landing budget #96): each file is at most 6 MB (about 540 kbps for the full cut, so
encode with a tight bitrate and check the result), and the WebVTT captions must match the burned-in text.

Silent (no music) or royalty-free music only. Light palette from `src/design/tokens.json` (brand 500 `#7c6cff`).
Fonts are the app's own: Inter and IBM Plex Sans Arabic (OFL).

## Persona

**Nour**, head of sales at a nine-person office-supplies company in Nasr City, Cairo. Leads arrive all day from the
website form. She reads each one and decides by hand who gets a call today.

All names, companies and numbers are sample data. "Ada Lovelace / analytical.io / 120 employees" is the lead that
the real Lead Qualifier template uses, so the story and the recorded UI show the same record.

## Full story (EN / AR copy lives in `tools/story-video/src/story.ts`)

| # | Time | Beat | On screen | Real feature |
|---|---|---|---|---|
| 1 | 0.0-4.5 | Hook | "Cairo · 9:04 AM" · "The inbox is full before the coffee is." Five lead cards drop in. | (story) |
| 2 | 4.5-10.0 | Persona | Nour's card: role, place, "A team of 9", "Leads from the website form, all day". | (story) |
| 3 | 10.0-19.0 | Pain | "Every lead is read and sorted by hand. Big accounts wait in the same queue. Some go cold before anyone calls." The queue cards turn "Waiting 2 days", one fades to "Went cold". | (story) |
| 4 | 19.0-23.0 | Turn | "So Nour writes her rule once. Flowline runs it for every lead." | |
| 5 | 23.0-32.0 | Solution 1 | Real UI: Templates page, Lead Qualifier, canvas opens. | Templates, sample data first run |
| 6 | 32.0-43.4 | Solution 2 | Real UI: Add node, drag, connect, set the condition (JSONata). | Canvas builder, condition step |
| 7 | 43.4-54.7 | Solution 3 | Real UI: Run, steps light up, run dock: Ada lands in "Hot lead". | Execution, live run status |
| 8 | 54.7-62.7 | Solution 4 | Real UI: run inspector, input/output per step, History. | Run inspector, run history, versions |
| 9 | 62.7-66.3 | Solution 5 | Real UI: Share a copy with the ops workspace (connections cleared). | Share a copy, workspaces |
| 10 | 66.3-72.3 | Outcome | "Next Monday": the same five leads sort themselves into "Hot lead · call today" and "Nurture". | (result of 5-9) |
| 11 | 72.3-78.3 | Outcome | "What changed for Nour": same check for every lead; big accounts on top; every decision has a record. | |
| 12 | 78.3-83.3 | Call to action | Flowline wordmark, tagline, "Preview · free during the beta", "Start building — free" (= `landing.ctaStart`). | |
| 13 | 83.3-88.8 | Hand-off to Mizano | "Ada's company says yes. The deal moves on to the books." A "Won" card travels from a Flowline tile to a Mizano tile and becomes "New customer · quote to prepare". Label: **"Vision · the Flowline × Mizano link is not built yet"**. | concept only, no UI |

## Short (about 19 s)

Hook "Still sorting every lead by hand?" over the waiting queue (3.2 s) → "Write the rule once." (2 s) → real UI Run
(6.5 s) → real UI inspector "Open any step to see why it went where it did." (3.5 s) → call to action (3.5 s).

## Better together (30-45 s, rendered after the Mizano pilot)

1. Nour's lead qualifies in Flowline (real Flowline UI, 8 s).
2. Concept segment, clearly labelled **"Coming soon · vision"**: the won lead becomes a Mizano customer and a draft
   quote (animated cards only, no invented UI), 8-10 s.
3. Real Mizano UI: the quote converted to an invoice, then the payment recorded (10-12 s).
4. Concept, labelled: an overdue invoice in Mizano starts Flowline's "Invoice Follow-up List" flow (6 s).
5. Shared end card: both wordmarks, "Work flows in Flowline. The books close in Mizano." (4 s).

The data each arrow carries is listed in [integration-story.md](integration-story.md).

## Honesty rules (AGENTS.md)

- Real UI only, recorded on sample data; no staged states, no AI provider or model names, no integration screens,
  no pricing or numeric claims about Flowline.
- Anything not built (the Mizano link) is drawn as abstract cards with a visible "vision / not built yet" label.
- Arabic is first-class: an RTL layout (chapter pill at the inline start, cards flow right to left) and Arabic-Indic
  numerals in the Arabic cut.

## Pipeline (scenes as code)

`tools/story-video/` (Remotion 4.0.534, isolated package, own lockfile, not a workspace member, excluded from root
tsc/ESLint). It is on branch `video/story-pipeline` until the final render; it is not on `main` yet.

- `src/story.ts`: scenes and EN/AR copy (edit this when features change). `src/brand.ts`: palette.
- `src/engine/`: scene kinds `kinetic`, `persona`, `footage` (real UI video or screenshot with a camera move),
  `outcome`, `handoff` (concept), `cta`; shared with the Mizano film.
- `fetch-footage.mjs`: copies the real walkthrough recordings from `public/media/demo/` (#99), or from the `ai/99`
  head commit until #99 lands.
- Commands (local only, never in CI; not between 02:45 and 04:00 Cairo; concurrency 2):
  `cd tools/story-video && pnpm install --ignore-workspace && node fetch-footage.mjs`, then
  `npx remotion render src/index.ts story-en out/story-en.mp4` (also `story-ar`, `short-en`, `short-ar`).

Before the final render: re-record the walkthrough on the pilot build (#99), check each scene's in/out points against
the new recording, review every frame for text overflow and RTL, generate a contact sheet of every scene and attach it to the
final-assets PR, then encode WebM and posters and embed through #100.
