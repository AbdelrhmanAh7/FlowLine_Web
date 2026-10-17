# Merged browser gate: environment (run merged-faec2a3-20260929-0459)

| Item | Value |
|---|---|
| Code | `ai-hub` @ `faec2a32927d21aa758edd90c513ca6583a9984d` (clean apart from evidence files) |
| Claude Code | 2.1.284; background-shell memory reaping left ENABLED (not disabled, per owner) |
| Host | Windows 11 Home 10.0.26200, 32 logical CPUs, 31.2 GB RAM (15.6 GB free at start; commit 26.4 / 53.2 GB) |
| Node / pnpm | v25.6.1 / 10.32.1 |
| Docker | 29.8.0 on WSL2, `.wslconfig`: memory=4GB, swap=4GB (applies to the WebKit container and the DB containers) |
| Test stack | one `pnpm db:migrate:test && pnpm dev:test` (Next dev server :3100 + worker + fakes :4020/:4021 per `.env.test`), reused by every Playwright run (`reuseExistingServer: true`) |
| Playwright | `--workers=1` (config default 2), retries 0 (config), browsers run one project at a time |
| Cloud-only | no Ollama / model downloads; AI via provider test doubles only (labelled; NOT live cloud verification) |

## Attempt history
- Attempt 1 (Chromium + Firefox, config default 2 workers, stack started by Playwright): stopped by Claude Code
  memory reaping about 15 s in, before any test result
  (`INTERRUPTED-attempt1-chromium+firefox.txt`, kept as evidence). Afterwards 6 leftover fake-provider node processes
  from the stopped design-v2 Kimi run (FL-wt-design) were stopped; no other processes touched.

## Expected coverage (from `playwright test --list`)
- **Chromium:** 65 tests (all specs, including `admin-panel.spec.ts` × 3).
- **Firefox:** 24 tests (`grep: /@critical|@cross-browser/`, an intentional config difference; `admin-panel.spec`
  is untagged, so it is Chromium only).
- **WebKit:** the same tag filter as Firefox, run in the Linux Playwright image via `e2e/tools/webkit-docker.sh`.
