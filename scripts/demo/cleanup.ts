// Build teardown: close the browser → stop the isolated stack → drop the compositor's public/ → release the lock.
// Each step runs even when an earlier one throws (Playwright's Browser.close() rethrows errors other than
// TargetClosedError), and the lock is released last no matter what, so a failed teardown can never leave a stale
// build.lock that makes the next `pnpm demo:build` refuse to start.

export type Closable = { close: () => Promise<void> };
export type Stoppable = { stop: () => Promise<void> };

/** Runs the teardown chain with releaseLock() guaranteed last; the first failure is rethrown afterwards. */
export async function cleanupBuild(steps: {
  browser: Closable | null;
  stack: Stoppable | null;
  removePublic: () => void;
  releaseLock: () => void;
}): Promise<void> {
  try {
    await steps.browser?.close();
  } finally {
    try {
      await steps.stack?.stop();
    } finally {
      try {
        steps.removePublic();
      } finally {
        steps.releaseLock();
      }
    }
  }
}
