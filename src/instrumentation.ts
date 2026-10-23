import { assertAutoVerifyAllowed } from "@/server/test-auto-verify";

/**
 * Next.js calls register() once when a server instance starts, before it serves any request; when it throws,
 * `next start` logs the error and exits (Next 16: server/lib/start-server.js). `next build` does not call it.
 * Issue 124: the test-only sign-up auto-verify switch must never run outside FLOWLINE_ENV=test, so such a server
 * refuses to start while FLOWLINE_TEST_AUTO_VERIFY is set (src/server/test-auto-verify.ts).
 */
export function register(): void {
  assertAutoVerifyAllowed();
}
