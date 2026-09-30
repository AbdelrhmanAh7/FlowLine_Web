import { expect, test } from "@playwright/test";
import { cancelRunQuietly, setupStuckSheetsRun, setupUser } from "./helpers";

/**
 * The global Playwright config runs with reducedMotion: "reduce" (stability). The running state must
 * then be STATIC: no animation anywhere, the running node shows a ring instead of a pulsing glow.
 */
test.describe("reduced motion", () => {
  // The Sheets step is held by the fake provider for 30 s: cancel the run afterwards so it does not keep a worker busy.
  // (Not resetFakeProvider: the fake is shared with the other Playwright worker.)
  let stuckRunId: string | undefined;
  test.afterEach(async ({ page }) => {
    await cancelRunQuietly(page.request, stuckRunId);
    stuckRunId = undefined;
  });

  test("the running node has no animation — a static ring marks it", async ({ page }) => {
    const { workspace } = await setupUser(page);
    const { flowId, runId } = await setupStuckSheetsRun(page.request, workspace.id, { mode: "delay", delayMs: 30_000 });
    stuckRunId = runId;
    await page.goto(`/w/${workspace.slug}/flows/${flowId}`);

    const runningNode = page.getByTestId("node-sheet");
    await expect(runningNode).toHaveClass(/motion-running/);
    const styles = await runningNode.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { animationName: cs.animationName, boxShadow: cs.boxShadow, transitionDuration: cs.transitionDuration };
    });
    expect(styles.animationName).toBe("none");
    expect(styles.boxShadow).not.toBe("none"); // the static ring
    // Browsers serialise 0.001ms differently ("0.001ms", "1e-06s"): compare the value, in ms.
    const ms = (v: string) => (v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000);
    expect(Math.max(...styles.transitionDuration.split(",").map((v) => ms(v.trim())))).toBeLessThanOrEqual(0.01);

    // Edge flow and skeleton shimmer are off too.
    const edge = await page.locator(".react-flow__edge.flowing .react-flow__edge-path").first().evaluate((el) => getComputedStyle(el).animationName).catch(() => "missing");
    expect(edge === "none" || edge === "missing").toBeTruthy();
  });
});
