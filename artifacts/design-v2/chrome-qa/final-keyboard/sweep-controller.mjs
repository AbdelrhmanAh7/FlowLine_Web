// Keyboard-only surface activation. No screenshots/traces/field values collected.
export function controller(qa, fs, emit) {
  const page = () => qa.page;
  const focused = () => page().evaluate(() => ({ tag: document.activeElement?.tagName, role: document.activeElement?.getAttribute('role'), label: document.activeElement?.getAttribute('aria-label') }));
  const record = async (id, data) => {
    qa.checks.push({ id, ...data });
    await fs.writeFile(`${qa.out}/checks.json`, JSON.stringify(qa.checks, null, 2));
    emit({ id, ...data });
  };
  const go = async (route) => { await page().goto(`http://localhost:3100${route}`); await page().waitForTimeout(400); };
  const enter = async (locator) => { await locator.focus(); await page().keyboard.press('Enter'); await page().waitForTimeout(300); };
  const sweep = async (id, launcher, panel, mode = 'modal') => {
    const opener = await launcher.elementHandle();
    await enter(launcher);
    await panel.waitFor({ state: 'visible' });
    const name = await panel.evaluate(e => e.getAttribute('aria-label') || document.getElementById(e.getAttribute('aria-labelledby'))?.textContent || e.getAttribute('data-testid'));
    const initial = await panel.evaluate(e => e.contains(document.activeElement));
    const start = await page().locator(':focus').elementHandle();
    let outside = false;
    const count = await panel.locator('button,a,input,select,textarea,[tabindex="0"]').count();
    for (let i = 0; i < Math.min(75, count + 3); i++) {
      await page().keyboard.press('Tab');
      outside ||= !await panel.evaluate(e => e.contains(document.activeElement));
      if (outside && mode !== 'modal') break;
    }
    if (mode === 'modal') {
      for (let i = 0; i < count + 3; i++) {
        await page().keyboard.press('Shift+Tab');
        outside ||= !await panel.evaluate(e => e.contains(document.activeElement));
      }
    } else if (await panel.isVisible()) await start.focus();
    await page().waitForTimeout(450); // let departing focus tooltips finish their exit
    const nestedTooltip = await page().getByRole('tooltip').count();
    await page().keyboard.press('Escape');
    await page().waitForTimeout(400);
    if (nestedTooltip && await panel.isVisible()) {
      await page().keyboard.press('Escape');
      await page().waitForTimeout(400);
    }
    const closed = !await panel.isVisible();
    const returned = await opener.evaluate(e => e === document.activeElement);
    const bodyLoss = await page().locator('body').evaluate(e => e === document.activeElement);
    await record(id, { name, mode, initial, tabOutside: outside, nestedTooltip, escape: closed, returned, bodyLoss,
      result: initial && closed && returned && !bodyLoss && (mode !== 'modal' || !outside) ? 'PASS' : 'FAIL' });
  };
  const selects = async (id, scope = page()) => {
    const selects = scope.locator('select:visible');
    for (let i = 0; i < await selects.count(); i++) {
      const select = selects.nth(i);
      if (await select.isDisabled()) continue;
      await select.focus();
      const before = await select.inputValue();
      await page().keyboard.press('Alt+ArrowDown');
      await page().keyboard.press('Escape');
      const returned = await select.evaluate(e => e === document.activeElement);
      await record(`${id}:native-select-${i}`, { returned, cancelledWithoutChange: before === await select.inputValue(), result: returned && before === await select.inputValue() ? 'PASS' : 'FAIL' });
    }
  };
  return { go, enter, focused, record, sweep, selects };
}
