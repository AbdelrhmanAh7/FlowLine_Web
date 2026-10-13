# Issue #100 validation handoff — 2026-10-13

Implementation is already present on `ai/100`; this rescue did not change product code.
Do not mark the issue complete until these acceptance checks have first-hand evidence:

- Supply a disposable test stack through the harness: the focused Playwright command
  fails before executing tests because `.env.test` is absent. A non-secret TCP probe
  of `127.0.0.1:5432` also returns `EPERM` in this sandbox. The e2e-army app target
  therefore cannot run here. Do not copy production secrets or use the development DB.
- Run `e2e-army/100-landing-demo.e2e.ts`, the Chromium landing-demo and existing
  landing specs, including EN/AR layout and the media-error retry regression.
- Record hosted production-build Lighthouse before/after, CLS and actual added
  client gzip size. Existing size estimates are not production measurements.
- Verify immutable headers and Range 206 against real content-hashed media after
  #99 supplies it; a skipped Range test is not verification.

The inherited diff exceeds the owner's approximate 300-line limit (2,193 added
lines against local `main`). Do not expand it or claim size compliance; the owner
must decide how to split the existing implementation for review. No workflow
changes, pushes, PR actions or review-thread resolutions were performed here.
