# Issue #234 — blocker

`tests/unit/route-error-headers.test.ts` is committed but fails on purpose.

**Depends on #200:** `handleRoute` in `src/server/http.ts` (around lines 151–167 on `origin/main`) sends error responses without `cache-control: no-store` or `referrer-policy: no-referrer`. #200 must add those headers. This issue does not touch `http.ts`, and the test is not skipped.

**Observed:** all four cases fail on `expect(res.headers.get("cache-control")).toBe("no-store")` with `null`. Status and `error.code` assertions pass.

**Question for the tech lead:** merge this test after #200 lands, or hold it until then? If held, drop the commit or mark the PR draft.
