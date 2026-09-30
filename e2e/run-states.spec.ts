import { expect, test } from "@playwright/test";
import { cancelRunQuietly, setupStuckSheetsRun, setupUser } from "./helpers";

/**
 * A run's visual states: while the Sheets step is held by the fake provider, its node pulses in its
 * hue and the incoming edge flows; when the provider answers, the run finishes and the step shows its
 * success tick. Runs WITH motion (the one spec that opts out of the global reducedMotion), on every
 * browser (@cross-browser).
 */
test.describe("run visual states @cross-browser", () => {
  test.use({ reducedMotion: "no-preference" });

  // The happy path waits for the run to finish; if an earlier assertion fails first, the run would be left running for
  // the rest of the 10 s hold, so cancel it (a no-op when it already succeeded).
  let stuckRunId: string | undefined;
  test.afterEach(async ({ page }) => {
    await cancelRunQuietly(page.request, stuckRunId);
    stuckRunId = undefined;
  });

  test("running glows and flows, succeeded draws its tick", async ({ page }) => {
    test.setTimeout(90_000);
    const { workspace } = await setupUser(page);
    const { flowId, runId } = await setupStuckSheetsRun(page.request, workspace.id, { mode: "delay", delayMs: 10_000 });
    stuckRunId = runId;
    await page.goto(`/w/${workspace.slug}/flows/${flowId}`);

    // Running: the node pulses (m-running in its category hue) and the edge into it flows.
    const runningNode = page.getByTestId("node-sheet");
    await expect(runningNode).toHaveClass(/motion-running/);
    expect(await runningNode.evaluate((el) => getComputedStyle(el).animationName)).toBe("m-running");
    const flowing = page.locator(".react-flow__edge.flowing .react-flow__edge-path").first();
    // A straight horizontal edge has a zero-height box, which toBeVisible() treats as hidden: assert it is in the DOM.
    await expect(flowing).toBeAttached();
    expect(await flowing.evaluate((el) => getComputedStyle(el).animationName)).toBe("m-edge-flow");

    // The fake answers after 10s: the run finishes and the step shows its success tick.
    await expect
      .poll(
        async () => {
          const { run } = await (await page.request.get(`/api/runs/${runId}`)).json();
          return run.status;
        },
        { timeout: 60_000, message: "run did not finish" },
      )
      .toBe("succeeded");

    await expect(page.getByTestId("node-sheet").locator(".motion-check-draw").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("node-sheet")).not.toHaveClass(/motion-running/);
  });
});
