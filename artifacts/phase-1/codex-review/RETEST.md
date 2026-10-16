# Flowline Phase 1 — agent-driven exploratory retest

## Revision and method

- Tested Git revision `c35485e95e5702d822d50a9ffc28b512ac5f6ce8` on 2026-09-27 at `http://localhost:3100`, using the already running test stack. No servers were started or stopped, no product code was changed, and no commit was made.
- Used Playwright 1.63.0 with real headless Chromium, one browser process at a time. Actions were browser clicks, typing, keyboard presses, drags, and navigation; no app state or API was injected. A fresh `@flowline-e2e.test` account completed the journey. Screenshots and scripts are in this directory. Saved observations for the journey, canvas/settings, multi-select, and unavailable handles are in `retest-journey-results.json`, `retest-coverage-results.json`, `retest-multiselect-results.json`, and `retest-unavailable-connections-results.json`. CR-01 and responsive measurements are recorded below from the browser run.
- An initial script assumed the old new-flow dialog still existed, then a later script tried to inspect Settings before reopening its General tab after reload. Both automation selectors were corrected and the affected paths were rerun. One sign-in stayed pending during a retry; a separate browser probe subsequently received HTTP 200 and navigated normally. This did not reproduce as a product failure.

## Results

| Item | Result | Evidence |
| --- | --- | --- |
| CR-01: focused node arrow nudge and persistence | **PASS** | After clicking the node, focus was on its React Flow node element. Position `(300,120)` → ArrowRight `(312,120)` → Shift+ArrowDown `(312,121)`; reload retained `(312,121)`. [Nudge](screenshots/retest-cr01-nudge.png), [reload](screenshots/retest-cr01-reloaded.png). |
| CR-02: per-flow Success rate | **PASS** | One successful and one failed run produced **50.0%** in the Lead Qualifier row, including after dashboard reload. [Failed run](screenshots/retest-cr02-failed-run.png), [dashboard](screenshots/retest-cr02-success-rate.png), [reload](screenshots/retest-cr02-success-rate-reload.png). |
| Invalid connection: self | **PASS** | A transform source dragged to its own input left edges at 0 and showed “A node can't connect to itself.” [Screenshot](screenshots/retest-connection-self.png). |
| Invalid connection: loop | **PASS** | After connecting transform A → B, B → A left the edge count at 1 and showed “That connection would create a loop.” [Screenshot](screenshots/retest-connection-loop.png). |
| Invalid connection: second input | **PASS** | Trigger → B, where B already had A → B, left the edge count at 1 and showed “JSON transform already has an input.” [Screenshot](screenshots/retest-connection-second-input.png). |
| Invalid connection: into Trigger | **PASS** | Trigger exposed no target handle. Dragging a transform source onto the Trigger body kept four existing edges unchanged. [Screenshot](screenshots/retest-connection-into-trigger.png). |
| Invalid connection: out of Output | **PASS** | Output exposed no source handle. Dragging its body toward a transform input kept four existing edges unchanged. [Screenshot](screenshots/retest-connection-out-of-output.png). |
| Shift-drag box selection, then Delete | **PASS** | The box visibly selected both transforms; Delete removed both, leaving Trigger and Output. [Selection](screenshots/retest-multiselect-shift-box.png), [deleted](screenshots/retest-multiselect-box-deleted.png). |
| Ctrl-click multi-select, then Backspace | **PASS** | Ctrl-click selected Trigger and Output together (`na1tt1`, `na2jn4`); Backspace removed both, leaving zero nodes. [Selection](screenshots/retest-multiselect-ctrl-click.png), [deleted](screenshots/retest-multiselect-backspace-deleted.png). |
| Settings: rename workspace and save timezone | **PASS** | Workspace name saved as “Codex Retest QA” with `Africa/Cairo`, then was renamed to “Codex Retest Verified”; reload retained the latter name and `Africa/Cairo`. [Saved](screenshots/retest-settings-saved.png), [reloaded](screenshots/retest-settings-reloaded.png). |
| Settings: disabled controls explain themselves | **PASS** | Invite, Create key, and Upgrade each had `aria-disabled="true"` and a specific accessible tooltip reason on focus. [Invite](screenshots/retest-settings-disabled-invite.png), [Create key](screenshots/retest-settings-disabled-create-key.png), [Upgrade](screenshots/retest-settings-disabled-upgrade.png). |
| Responsive Dashboard, 1440/1024/375 | **PASS** | Document width equalled viewport width at all three sizes; no page-level horizontal scroll. [1440](screenshots/retest-responsive-dashboard-1440.png), [1024](screenshots/retest-responsive-dashboard-1024.png), [375](screenshots/retest-responsive-dashboard-375.png). |
| Responsive Run history, 1440/1024/375 | **PASS** | Document width equalled viewport width at all three sizes. [1440](screenshots/retest-responsive-runs-1440.png), [1024](screenshots/retest-responsive-runs-1024.png), [375](screenshots/retest-responsive-runs-375.png). |
| Responsive Templates, 1440/1024/375 | **PASS** | Document width equalled viewport width at all three sizes. [1440](screenshots/retest-responsive-templates-1440.png), [1024](screenshots/retest-responsive-templates-1024.png), [375](screenshots/retest-responsive-templates-375.png). |
| Responsive Integrations, 1440/1024/375 | **PASS** | Document width equalled viewport width at all three sizes. [1440](screenshots/retest-responsive-integrations-1440.png), [1024](screenshots/retest-responsive-integrations-1024.png), [375](screenshots/retest-responsive-integrations-375.png). |
| Responsive Settings, 1440/1024/375 | **PASS** | Document width equalled viewport width at all three sizes. [1440](screenshots/retest-responsive-settings-1440.png), [1024](screenshots/retest-responsive-settings-1024.png), [375](screenshots/retest-responsive-settings-375.png). |
| Drawer swipe to dismiss at 1024 | **PASS** | Dragging the drawer header right by 135px dismissed it; drawer count became zero. [Before](screenshots/retest-drawer-before-swipe.png), [after](screenshots/retest-drawer-after-swipe.png). |
| Journey: sign up → onboarding → build → run → inspect | **PASS** | Fresh account completed all three onboarding steps, opened the Lead Qualifier canvas, ran successfully, and opened a step with input/output details in the inspector. [Sign-up](screenshots/retest-journey-signup.png), [onboarding](screenshots/retest-journey-onboarding.png), [builder](screenshots/retest-journey-builder.png), [run](screenshots/retest-journey-run.png), [inspector](screenshots/retest-journey-inspector.png). |

## New findings

| ID | Severity | Area | Steps to reproduce | Expected vs actual | Evidence |
| --- | --- | --- | --- | --- | --- |
| None | — | — | — | No new reproducible product findings in the requested paths. | — |
