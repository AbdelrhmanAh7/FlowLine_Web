# Runtime and image-input candidate

- Base: `9641ad1e684cad7b84bd2385751ea19b0a9d4060`, branch `codex/pilot-security-runtime-round1`. Source is an uncommitted candidate diff; no new committed SHA claimed.
- M9 source correction: Node 22 LTS in both Docker build/runtime; CI already selected 22; package support now `22.x` and README aligned. Official [Node release schedule](https://github.com/nodejs/Release#release-schedule) checked 2026-10-03: Node 22 maintenance support through 2027-04-30. Node 25 EOL is recorded in the [official release table](https://nodejs.org/en/about/previous-releases).
- L2 source: pinned immutable official registry manifest-index digests below. `docker buildx imagetools inspect <tag> --format '{{json .Manifest.Digest}}'` executed on 2026-10-03; metadata reads only. No image pull/build/run/push, no deployment.

| Official image tag | Resolved manifest-index digest |
| --- | --- |
| `docker/dockerfile:1.7` | `sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e` |
| `node:22-bookworm-slim` | `sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c` |
| `node:22-alpine` | `sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402` |
| `caddy:2.10-alpine` | `sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d` |
| `postgres:17.6-alpine` | `sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94` |

Additional exploratory tag metadata `postgres:17` (`sha256:d74eeac9a635390a49bc21bd49fccd973de707e2a53a76ac49b552b8712ec46f`) and `postgres:17-alpine` (`sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`) was observed but **not selected**: the candidate retains its reviewed `17.6-alpine` version line.

M9/L2 remain **PARTIAL for acceptance**: local host is Node `v25.6.1`, so local static source checks do not execute the selected Node 22 runtime. Required build/auth/worker/migration/sandbox/platform checks and OS/runtime vulnerability assessment are pending; selected digests/platform bytes have not been independently approved or run. Operator sandbox overrides/dynamic application deployment-image values still need concrete digest verification. Update procedure is in `docs/security/RELEASE_INPUT_UPDATE.md`.

Focused checks: `pnpm exec vitest run --project unit --fileParallelism=false tests/unit/release-input-policy.test.ts`: **1 file / 2 tests passed**, no skips (2026-10-03, Node 25 host). Targeted ESLint for the policy test and `src/server/code-sandbox.ts`, plus `git diff --check`, passed. Test checks approved major consistency, digest syntax across executable CI/release/security-sensitive defaults, and identical sandbox default/CI pull bytes. No full typecheck or runtime/build acceptance is claimed for this source-only policy candidate.

No environment files read, subscriptions/API spend, containers/services/deployments changed, commits or pushes by this worker. Model/tool: Codex security worker.
