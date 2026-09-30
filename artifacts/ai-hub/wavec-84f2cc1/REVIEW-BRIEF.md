# Codex: independent security + code review of the AI hub and credentials work (Wave C, step A)

You are an independent reviewer. **READ-ONLY:** do not modify any file, do not commit, and do not start servers,
browsers or Docker.

- **Repo:** this worktree, branch `ai-hub`. Review the product code at `84f2cc1`. Compare with the base `1a9883f`
  (the `phase-4` private-beta candidate), e.g. `git diff 1a9883f..84f2cc1 --stat`, then read the changed code.
- **Context docs:** `docs/ai/IMPLEMENTATION_PLAN.md` (incl. §3a, customer keys only through the UI),
  `docs/ai/ROUTING.md`, `docs/ai/PROVIDERS.md`, `docs/security/CREDENTIALS_DESIGN.md`, `SCOPE_MATRIX.md` (AI-HUB +
  SEC rows), `artifacts/security-review/`.
- **Earlier findings:** Fable's and Codex's design reviews, and `artifacts/phase-4/codex-review/`. Don't repeat fixed
  items; do check that they're really fixed.

**Focus areas.** Report only issues you verified by reading the code path.
1. **Security**
   - Tenancy: every access through `src/server/access.ts`; non-members get 404.
   - `ai.manage` vs `use_roles`, checked at selection AND execution.
   - Platform-admin boundary (`src/server/platform-access.ts`): 404, session-cookie only, TOTP, step-up binding and
     expiry, bootstrap single-use and serialisation.
   - CSRF/Origin on secret endpoints, and rate limits.
2. **Credential handling**
   - Crypto v2 envelope + AAD (`src/server/crypto.ts`) and its strict parser.
   - The v1 legacy path: any downgrade route?
   - Key-ring separation, rewrap script.
   - Write-only projections: any secret, ciphertext or hint in responses, RSC/HTML, logs, telemetry, audit,
     `ai_attempt`, run meta, errors.
   - No env fallback anywhere on a tenant path (grep `process.env`); platform secrets resolved from the DB only;
     import-from-env once.
3. **Protocols and SSRF**
   - `src/ai/hub/protocols/*`, `transport.ts`, `src/server/egress.ts`: host allowlists, redirects, credentials never
     sent cross-origin, provider-field injection into hosts/paths/headers, response size and time bounds, SSE parser
     robustness, cancellation.
   - Error mapping that could leak provider bodies.
4. **Routing and metering**
   - FALLBACK / FREE_ONLY / LOW_COST: never bypassing an auth refusal, revocation, safety refusal, cancellation or
     budget.
   - Defensible reservations, reconciliation, unknown ≠ 0, concurrent-reservation races, duplicate billing, tool
     replay after retries, partial-stream handling, circuit breaker.
5. **Migration**
   - `drizzle/0012`–`0014`: data steps, legacy local-provider configs (`AI_LOCAL_MIGRATION_REQUIRED`, never silently
     converted), OAuth app backfill / `reconnect_required`, deletion of pending states.
   - Upgrading an existing Phase 4 database safely.
6. **OAuth hardening**
   - Issuing-app binding, state binding + hashing, callback re-checks, refresh fencing, `invalid_client` handling,
     per-workspace app provenance, better-auth revision factory (`src/server/auth-dispatch.ts`), social-token
     encryption.
7. **Honesty in UI:** no fake success, prices or verification claims. Live checks show NOT RUN.

**Output.** A markdown report with a findings table: id `CXH-NN`, severity P0–P3, area, file:line, a concrete
failure scenario (inputs/state → wrong result), a minimal fix, and verified yes/no. Then list the areas you checked
and found clean. State what you did not review.
