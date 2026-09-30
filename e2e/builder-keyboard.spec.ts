import { expect, test, type Locator, type Page } from "@playwright/test";
import { setupUser } from "./helpers";

/**
 * Keyboard lifecycle of the builder's floating surfaces (DV2-M01, DV2-M02): the Add node catalogue, the Copilot and History
 * panels and the Flow issues popover. Each opens from its toolbar launcher, Escape closes it, and focus is back on the launcher
 * (never <body>, where the next Tab would restart at "Skip to content").
 *
 * All browsers run this @cross-browser suite. Proposal fixtures exercise UI state only (test doubles, not live AI).
 */

/** A blank flow has no trigger, which is exactly the "invalid flow" the Flow issues popover lists. */
async function openBlankBuilder(page: Page) {
  const { workspace, flowId } = await setupUser(page, { template: "blank" });
  await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
  await expect(page.getByTestId("builder")).toBeVisible();
  // The editor renders only once the flow has loaded on the client, so its buttons are hydrated when they appear.
  await expect(page.getByRole("button", { name: /Add node/ })).toBeVisible();
}

/** Activates a launcher the way a keyboard user does: focus it, press Enter. */
async function pressEnterOn(page: Page, launcher: Locator) {
  await launcher.focus();
  await expect(launcher).toBeFocused();
  await page.keyboard.press("Enter");
}

const focusIsInside = (panel: Locator) => panel.evaluate((el) => el.contains(document.activeElement));

test.describe("@cross-browser builder keyboard lifecycle (DV2-M01 / DV2-M02)", () => {
  test("Add node: Enter opens the catalogue, Escape closes it, focus is back on the launcher", async ({ page }) => {
    await openBlankBuilder(page);
    const launcher = page.getByRole("button", { name: /Add node/ });
    const catalogue = page.getByRole("dialog", { name: "Add node" });

    await pressEnterOn(page, launcher);
    await expect(catalogue).toBeVisible();
    await expect(launcher).toHaveAttribute("aria-expanded", "true");
    await expect(catalogue.getByRole("textbox", { name: "Search nodes" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(catalogue).toHaveCount(0);
    await expect(launcher).toHaveAttribute("aria-expanded", "false");
    await expect(launcher).toBeFocused(); // DV2-M01: this used to be <body>
    await expect(page.locator("body")).not.toBeFocused();
  });

  test("Add node: opened with the / shortcut from the page, Escape still lands on the launcher", async ({ page }) => {
    await openBlankBuilder(page);
    const launcher = page.getByRole("button", { name: /Add node/ });
    const catalogue = page.getByRole("dialog", { name: "Add node" });

    await page.keyboard.press("/"); // nothing has focus: there is no opener to go back to, so the launcher is the fallback
    await expect(catalogue).toBeVisible();
    await expect(catalogue.getByRole("textbox", { name: "Search nodes" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(catalogue).toHaveCount(0);
    await expect(launcher).toBeFocused();
  });

  test("Add node: adding a node with Enter also closes the catalogue onto the launcher", async ({ page }) => {
    await openBlankBuilder(page);
    const launcher = page.getByRole("button", { name: /Add node/ });
    const catalogue = page.getByRole("dialog", { name: "Add node" });

    await pressEnterOn(page, launcher);
    await catalogue.getByRole("textbox", { name: "Search nodes" }).fill("manual");
    await page.keyboard.press("Enter");
    await expect(page.locator(".react-flow__node")).toHaveCount(1);
    await expect(catalogue).toHaveCount(0);
    await expect(launcher).toBeFocused();
  });

  for (const via of ["keyboard", "mouse"] as const) {
    test(`Copilot (opened by ${via}): focus moves into the panel, Escape closes it, focus returns to the Copilot button`, async ({ page }) => {
      await openBlankBuilder(page);
      const launcher = page.getByRole("button", { name: "Copilot", exact: true });
      const panel = page.getByRole("dialog", { name: "Copilot" });

      if (via === "keyboard") await pressEnterOn(page, launcher);
      else await launcher.click();
      await expect(panel).toBeVisible();
      await expect(panel.getByLabel("What should this workflow do?")).toBeFocused();
      expect(await focusIsInside(panel)).toBe(true);

      // Non-modal on purpose: the toolbar and canvas behind it stay in the accessibility tree and usable.
      await expect(panel).not.toHaveAttribute("aria-modal");
      await expect(page.getByRole("button", { name: /Add node/ })).toBeVisible();

      await page.keyboard.press("Escape"); // from inside the request field
      await expect(panel).toHaveCount(0);
      await expect(launcher).toBeFocused();
    });
  }

  test("Copilot: Escape from the close button closes it too, and the panel can be reopened and closed again", async ({ page }) => {
    await openBlankBuilder(page);
    const launcher = page.getByRole("button", { name: "Copilot", exact: true });
    const panel = page.getByRole("dialog", { name: "Copilot" });

    await pressEnterOn(page, launcher);
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Close Copilot" }).focus();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(launcher).toBeFocused();

    await pressEnterOn(page, launcher);
    await expect(panel.getByLabel("What should this workflow do?")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(launcher).toBeFocused();
  });

  test("Copilot: Escape does not close the panel while a request is in flight (the proposal would be lost), then closes it", async ({ page }) => {
    await openBlankBuilder(page);
    const launcher = page.getByRole("button", { name: "Copilot", exact: true });
    const panel = page.getByRole("dialog", { name: "Copilot" });

    // Hold the proposal request on the network until the test lets it fail: a deterministic "in flight".
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/flows/*/copilot", async (route) => {
      await gate;
      await route.abort();
    });

    await pressEnterOn(page, launcher);
    await panel.getByLabel("What should this workflow do?").fill("add a condition");
    const propose = panel.getByRole("button", { name: "Propose" });
    await propose.click();
    await expect(propose).toHaveAttribute("aria-busy", "true");

    await page.keyboard.press("Escape");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve))); // let React apply a close, were there one
    await expect(panel).toBeVisible();
    await expect(propose).toHaveAttribute("aria-busy", "true");

    release();
    await expect(propose).not.toHaveAttribute("aria-busy", "true");
    await expect(panel).toBeVisible(); // a failed request does not close it either; the person decides

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(launcher).toBeFocused();
  });

  for (const via of ["keyboard", "mouse"] as const) {
    test(`History (opened by ${via}): focus moves into the panel, Escape closes it, focus returns to the History button`, async ({ page }) => {
      await openBlankBuilder(page);
      const launcher = page.getByRole("button", { name: "History", exact: true });
      const panel = page.getByRole("dialog", { name: "Version history" });

      if (via === "keyboard") await pressEnterOn(page, launcher);
      else await launcher.click();
      await expect(panel).toBeVisible();
      await expect(panel.getByRole("heading", { name: "History", exact: true })).toBeFocused();
      expect(await focusIsInside(panel)).toBe(true);
      await expect(panel).not.toHaveAttribute("aria-modal");

      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(launcher).toBeFocused();
    });
  }

  test("History: Tab reaches the close button inside the panel first, and Escape from it closes the panel", async ({ page }) => {
    await openBlankBuilder(page);
    const launcher = page.getByRole("button", { name: "History", exact: true });
    const panel = page.getByRole("dialog", { name: "Version history" });

    await pressEnterOn(page, launcher);
    await expect(panel).toBeVisible();
    await page.keyboard.press("Tab"); // used to reach the toolbar behind the panel (Copilot, Runs, Run) before the panel's own controls
    await expect(panel.getByRole("button", { name: "Close history" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(launcher).toBeFocused();
  });

  test("History and Copilot swap without stealing focus back: the one that opens keeps it", async ({ page }) => {
    await openBlankBuilder(page);
    const historyButton = page.getByRole("button", { name: "History", exact: true });
    const copilotButton = page.getByRole("button", { name: "Copilot", exact: true });

    await historyButton.click();
    await expect(page.getByRole("dialog", { name: "Version history" })).toBeVisible();
    // The History panel covers the right end of the toolbar (Copilot included), so switch with the keyboard, not a click.
    await copilotButton.focus();
    await page.keyboard.press("Enter");
    const copilot = page.getByRole("dialog", { name: "Copilot" });
    await expect(copilot).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Version history" })).toHaveCount(0);
    await expect(copilot.getByLabel("What should this workflow do?")).toBeFocused();
    // Give History's own focus return (a zero-delay timer) time to run: it must find focus taken and leave it alone.
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
    await expect(copilot.getByLabel("What should this workflow do?")).toBeFocused();
  });

  for (const via of ["keyboard", "mouse"] as const) {
    test(`Flow issues (opened by ${via}): on an invalid flow Escape closes it and focus returns to the issues button`, async ({ page }) => {
      await openBlankBuilder(page);
      const launcher = page.getByRole("button", { name: /\d+ issues?/ });
      const dialog = page.getByRole("dialog", { name: "Flow issues" });

      if (via === "keyboard") await pressEnterOn(page, launcher);
      else await launcher.click();
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Add a trigger to start your flow");
      await expect(launcher).toHaveAttribute("aria-expanded", "true");

      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(launcher).toHaveAttribute("aria-expanded", "false");
      await expect(launcher).toBeFocused();
    });
  }
});


test.describe("@cross-browser Copilot preservation and panel refetch", () => {
  for (const via of ["Escape", "X"] as const) {
    test(`proposal, request, diff and removals choice survive ${via} and reopening without another POST`, async ({ page }) => {
      await openBlankBuilder(page);
      let posts = 0;
      await page.route("**/api/flows/*/copilot", async (route) => {
        expect(route.request().method()).toBe("POST");
        posts++;
        await route.fulfill({ json: { proposal: {
          id: "keyboard-proposal", flowId: null, status: "proposed", summary: "Remove the obsolete step",
          diff: { added: [], changed: [], removed: [{ id: "obsolete", type: "transform", label: "Obsolete step" }], edgesAdded: 0, edgesRemoved: 1 },
          issues: [], savedRevision: null, model: "UI test double",
        } } });
      });
      const launcher = page.getByRole("button", { name: "Copilot", exact: true });
      const panel = page.getByRole("dialog", { name: "Copilot" });
      const request = panel.getByLabel("What should this workflow do?");
      await pressEnterOn(page, launcher);
      await page.keyboard.type("Remove the obsolete step");
      await pressEnterOn(page, panel.getByRole("button", { name: "Propose", exact: true }));
      const proposal = panel.getByTestId("copilot-proposal");
      await expect(proposal).toContainText("Obsolete step");
      await panel.getByRole("checkbox").focus();
      await page.keyboard.press("Space");
      await expect(panel.getByRole("checkbox")).toBeChecked();
      const before = await proposal.innerText();
      if (via === "Escape") await page.keyboard.press("Escape");
      else await pressEnterOn(page, panel.getByRole("button", { name: "Close Copilot" }));
      await expect(panel).toHaveCount(0);
      await expect(launcher).toBeFocused();
      await pressEnterOn(page, launcher);
      await expect(request).toHaveValue("Remove the obsolete step");
      // Compare rendered text on both sides: textContent omits the block separators in innerText.
      await expect(proposal).toHaveText(before, { useInnerText: true });
      await expect(panel.getByRole("checkbox")).toBeChecked();
      expect(posts).toBe(1);
    });
  }

  test("a nested tooltip consumes Escape before Copilot", async ({ page }) => {
    await openBlankBuilder(page);
    await page.route("**/api/flows/*/copilot", (route) => route.fulfill({ json: { proposal: {
      id: "keyboard-nested", flowId: null, status: "proposed", summary: "Removal needs confirmation",
      diff: { added: [], changed: [], removed: [{ id: "old", type: "transform", label: "Old step" }], edgesAdded: 0, edgesRemoved: 0 },
      issues: [], savedRevision: null, model: "UI test double",
    } } }));
    const launcher = page.getByRole("button", { name: "Copilot", exact: true });
    const panel = page.getByRole("dialog", { name: "Copilot" });
    await pressEnterOn(page, launcher);
    await page.keyboard.type("Remove old step");
    await pressEnterOn(page, panel.getByRole("button", { name: "Propose", exact: true }));
    const approve = panel.getByRole("button", { name: "Approve & save draft" });
    await expect(approve).toHaveAttribute("aria-disabled", "true");
    await approve.focus();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(panel).toBeVisible();
    await expect(approve).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(launcher).toBeFocused();
  });

  test("History refetch does not steal focus inside or outside the non-modal panel", async ({ page, context }) => {
    await openBlankBuilder(page);
    const panel = page.getByRole("dialog", { name: "Version history" });
    await pressEnterOn(page, page.getByRole("button", { name: "History", exact: true }));
    await expect(panel.getByRole("heading", { name: "History", exact: true })).toBeFocused();
    for (const target of [panel.getByRole("button", { name: "Close history" }), page.getByRole("button", { name: /Add node/ })]) {
      await target.focus();
      // Reconnect after the query staleTime; observe the real GET, not just a render or a synthetic assertion.
      await context.setOffline(true);
      await page.waitForTimeout(5_100);
      const refetch = page.waitForResponse((r) => /\/api\/flows\/[^/]+\/versions$/.test(r.url()) && r.request().method() === "GET");
      await context.setOffline(false);
      expect((await refetch).ok()).toBe(true);
      await expect(target).toBeFocused();
      await expect(panel).toBeVisible();
    }
  });
});
