import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const root = path.resolve('artifacts/phase-2/codex-review');
const evDir = path.join(root, 'evidence');
const shotDir = path.join(root, 'screenshots');
const traceDir = path.join(root, 'traces');
await Promise.all([evDir, shotDir, traceDir].map(d => fs.mkdir(d, { recursive: true })));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const events = [];
const started = new Date().toISOString();
const stamp = Date.now().toString(36);
const identity = { email: `codex-retest-${stamp}@flowline-e2e.test`, slug: null, blankUrl: null, localUrl: null, templateUrl: null, sheetId: `retest-sheet-${stamp}`, channel: `C_RETEST_${stamp}`, approvalChannel: `C_APPROVE_${stamp}`, repairChannel: `C_REPAIR_${stamp}` };
const fake = 'http://127.0.0.1:4010';
const scrub = s => String(s).replace(/whsec_[A-Za-z0-9_-]+/g, '[REDACTED_WEBHOOK_SECRET]').replace(/\/api\/hooks\/[A-Za-z0-9_-]{20,}/g, '/api/hooks/[REDACTED_TOKEN]').replace(/(session[_-]?token|authorization|cookie|secret)([=:]\s*)([^\s,;"}]+)/gi, '$1$2[REDACTED]').replace(/params:\s*\[[^\]]*\]/gi, 'params: [REDACTED]').replace(/(?:Bearer\s+)[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]');
function mark(kind, data = {}) { const item = { at: new Date().toISOString(), kind, ...data }; events.push(item); console.log(JSON.stringify(item)); }
async function save() { await fs.writeFile(path.join(evDir, 'retest-events.json'), JSON.stringify({ started, ended: new Date().toISOString(), revision: 'c7b7b54', identity: { ...identity, email: '[test account redacted]' }, events }, null, 2)); }
async function shot(name, p = page) { const filename = `retest-${name}.png`; await p.screenshot({ path: path.join(shotDir, filename), fullPage: true }); mark('state', { name, url: p.url(), text: scrub((await p.locator('body').innerText()).slice(0, 7000)) }); }
async function phase(name, fn) { mark('phase-start', { name }); try { await fn(); mark('phase-pass', { name }); } catch (e) { mark('phase-error', { name, error: scrub(e.stack || e).slice(0, 1800) }); await shot(`${name}-error`).catch(() => {}); } await save(); }
async function closeDrawers() { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); }
async function waitSaved() { await page.locator('[data-testid="save-status"][data-status="saved"]').waitFor({ timeout: 15000 }); }
async function state(kind) { return (await (await page.request.get(`${fake}/__fake/state/${kind}`)).json()); }
async function fault(data) { const r = await page.request.post(`${fake}/__fake/fault`, { data }); mark('fault', { data, status: r.status(), body: scrub(await r.text()) }); if (!r.ok()) throw new Error('Fault control failed'); }
async function connectUI(provider, label) {
  await page.goto(`/w/${identity.slug}/integrations`);
  await page.getByRole('listitem').filter({ has: page.getByText(label, { exact: true }) }).getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('dialog', { name: `Connect ${label}` }).getByRole('button', { name: `Continue to ${label}` }).click();
  await page.getByTestId(`connection-${provider}`).waitFor({ timeout: 15000 });
  await shot(`connected-${provider}`);
}
async function pickConnection(drawer) { const sel = drawer.getByLabel('Connection'); const opts = await sel.locator('option').allTextContents(); const label = opts.find(x => x && !x.startsWith('Choose') && !x.startsWith('No ')); if (!label) throw new Error(`No connection: ${opts}`); await sel.selectOption({ label }); }
const statusName = { SUCCESS: 'Success', FAILED: 'Failed', RUNNING: 'Running', CANCELLED: 'Cancelled', 'NEEDS APPROVAL': 'Needs approval' };
async function waitRunStatus(status, timeout = 60000) { await page.getByTestId('run-dock').locator(':scope > div').first().getByText(statusName[status] ?? status, { exact: true }).waitFor({ timeout }); }
async function runAndWait(status, timeout = 60000) { await page.getByRole('button', { name: '▶ Run' }).click(); await waitRunStatus(status, timeout); }
async function connectNodes(a, b) { const x = await page.locator(`.react-flow__node[data-id="${a}"] .react-flow__handle.source`).boundingBox(); const y = await page.locator(`.react-flow__node[data-id="${b}"] .react-flow__handle.target`).boundingBox(); await page.mouse.move(x.x+x.width/2,x.y+x.height/2); await page.mouse.down(); await page.mouse.move(x.x+40,x.y+10,{steps:5}); await page.mouse.move(y.x+y.width/2,y.y+y.height/2,{steps:12}); await page.mouse.up(); }

context.on('page', p => {
  p.on('console', m => { if (m.type() === 'error' || /session[_-]?token|cookie|authorization|bearer|params:|secret/i.test(m.text())) mark('console', { type: m.type(), url: p.url(), sensitivePattern: /session[_-]?token|cookie|authorization|bearer|params:|secret/i.test(m.text()), text: scrub(m.text()).slice(0, 900) }); });
  p.on('pageerror', e => mark('pageerror', { url: p.url(), text: scrub(e.message).slice(0, 900) }));
  p.on('response', r => { if (r.status() >= 400) mark('response-error', { status: r.status(), url: r.url().replace(/([?&](?:token|secret|code)=)[^&]+/gi, '$1[REDACTED]') }); });
});
// The initial page was created before the context listener.
page.on('console', m => { if (m.type() === 'error' || /session[_-]?token|cookie|authorization|bearer|params:|secret/i.test(m.text())) mark('console', { type: m.type(), url: page.url(), sensitivePattern: /session[_-]?token|cookie|authorization|bearer|params:|secret/i.test(m.text()), text: scrub(m.text()).slice(0, 900) }); });
page.on('pageerror', e => mark('pageerror', { url: page.url(), text: scrub(e.message).slice(0, 900) }));
page.on('response', r => { if (r.status() >= 400) mark('response-error', { status: r.status(), url: r.url().replace(/([?&](?:token|secret|code)=)[^&]+/gi, '$1[REDACTED]') }); });

try {
  await phase('signup', async () => {
    await page.goto('/sign-up');
    await page.getByLabel('Name').fill('Codex Retest');
    await page.getByLabel('Email').fill(identity.email);
    await page.getByLabel('Password').fill(randomBytes(24).toString('base64url'));
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByRole('heading', { name: 'Name your workspace' }).waitFor({ timeout: 20000 });
    await page.getByLabel('Workspace name').fill(`Codex Retest ${stamp}`);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('radio', { name: /Sales & lead ops/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('radio', { name: /Blank flow/ }).click();
    await page.getByRole('button', { name: /Create flow & open canvas/ }).click();
    await page.getByText('Start with a trigger').waitFor();
    identity.slug = page.url().split('/')[4]; identity.blankUrl = page.url();
    await shot('signup-blank');
  });
  if (!identity.slug) throw new Error('Cannot continue without UI account');

  await phase('template-oauth', async () => {
    await connectUI('google_sheets', 'Google Sheets');
    await connectUI('slack', 'Slack');
    await page.goto(`/w/${identity.slug}/templates`);
    await shot('template-requirements');
    await page.getByTestId('template-lead-enrichment').getByRole('button', { name: 'Use template' }).click();
    await page.locator('.react-flow__node[data-id="sheet"]').waitFor();
    identity.templateUrl = page.url();
    const drawer = page.getByTestId('node-drawer');
    await page.locator('.react-flow__node[data-id="sheet"]').click();
    await pickConnection(drawer);
    await drawer.getByLabel('Input mapping (JSONata → object)').fill(`{ "spreadsheetId": "${identity.sheetId}", "range": "Leads!A1", "row": [$steps.hook.body.lead.name, $steps.enrich.company, $steps.score.label] }`);
    await closeDrawers();
    await page.locator('.react-flow__node[data-id="slack"]').click();
    await pickConnection(drawer);
    await drawer.getByLabel('Input mapping (JSONata → object)').fill(`{ "channel": "${identity.channel}", "text": "Hot lead: " & $steps.hook.body.lead.name }`);
    await closeDrawers(); await waitSaved();
    await shot('template-ready');
    await runAndWait('SUCCESS'); await shot('template-success');
    const sheets = await state('google_sheets'), slack = await state('slack');
    mark('template-provider-state', { rows: sheets.sheets[identity.sheetId] ?? [], messages: slack.messages.filter(x => x.channel === identity.channel) });
    await page.goto(`/w/${identity.slug}/templates`);
    await page.getByRole('listitem').filter({ has: page.getByText('Lead Qualifier', { exact: true }) }).getByRole('button', { name: 'Use template' }).click();
    await page.locator('.react-flow__node').first().waitFor(); identity.localUrl = page.url(); await shot('local-template-ready');
  });

  await phase('fault-rerun-retries', async () => {
    await page.goto(identity.templateUrl); await page.locator('.react-flow__node[data-id="sheet"]').waitFor();
    const newId = `${identity.sheetId}-fault`;
    await page.locator('.react-flow__node[data-id="sheet"]').click();
    await page.getByTestId('node-drawer').getByLabel('Input mapping (JSONata → object)').fill(`{ "spreadsheetId": "${newId}", "range": "Leads!A1", "row": [$steps.hook.body.lead.name, $steps.enrich.company, $steps.score.label] }`);
    await closeDrawers(); await waitSaved();
    await fault({ provider: 'google_sheets', pathPattern: newId, mode: '429', times: 3 });
    await page.getByRole('button', { name: '▶ Run' }).click();
    await page.getByText(/retry 2 \(rate limited\)/).first().waitFor({ timeout: 5000 }).then(() => shot('retry-429')).catch(() => mark('retry-transient-not-captured'));
    await waitRunStatus('FAILED'); await shot('fault-failed');
    await page.getByTestId('run-dock').getByRole('link', { name: /Open in inspector/ }).click();
    await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /Sheets — Add row/ }).first().click();
    await page.getByTestId('step-panel').getByRole('button', { name: /Re-run from this step/ }).click();
    await page.getByTestId('rerun-preview').getByText('Reused from').first().waitFor({ timeout: 15000 }); await shot('rerun-preview');
    await page.getByRole('dialog', { name: /Re-run/ }).getByRole('button', { name: /^Re-run \d+ steps?$/ }).click();
    await page.getByText(/Re-running as #/).waitFor({ timeout: 15000 });
    await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /#3.*Lead Enrichment Pipeline/ }).first().getByText('Success', { exact: true }).waitFor({ timeout: 30000 }); await shot('rerun-success');
    const sheets = await state('google_sheets'), slack = await state('slack');
    mark('rerun-provider-state', { rows: sheets.sheets[newId] ?? [], messages: slack.messages.filter(x => x.channel === identity.channel) });
  });

  await phase('approval', async () => {
    await page.goto(identity.templateUrl); await page.locator('.react-flow__node[data-id="slack"]').waitFor();
    await page.locator('.react-flow__node[data-id="slack"]').click();
    const drawer = page.getByTestId('node-drawer');
    await drawer.getByLabel('Input mapping (JSONata → object)').fill(`{ "channel": "${identity.approvalChannel}", "text": "Approve exact args ${stamp}" }`);
    await drawer.getByText('Require human approval before running').click();
    await closeDrawers(); await waitSaved();
    await page.getByRole('button', { name: '▶ Run' }).click();
    await waitRunStatus('NEEDS APPROVAL', 30000); await shot('approval-pending');
    await page.getByTestId('run-dock').getByRole('link', { name: /Open in inspector/ }).click();
    await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /Slack — Notify/ }).first().click(); await shot('approval-args');
    await page.getByTestId('decision-box').getByRole('button', { name: 'Approve' }).click();
    await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /#4.*Lead Enrichment Pipeline/ }).first().getByText('Success', { exact: true }).waitFor({ timeout: 30000 }); await shot('approval-success');
    mark('approval-provider-state', { messages: (await state('slack')).messages.filter(x => x.channel === identity.approvalChannel) });
    await page.goto(identity.templateUrl); await page.locator('.react-flow__node[data-id="slack"]').waitFor();
    await page.getByRole('button', { name: '▶ Run' }).click();
    await waitRunStatus('NEEDS APPROVAL', 30000);
    await page.getByTestId('run-dock').getByRole('link', { name: /Open in inspector/ }).click();
    await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /Slack — Notify/ }).first().click();
    await page.getByTestId('decision-box').getByRole('button', { name: 'Reject' }).click(); await shot('approval-rejected');
    mark('rejection-provider-state', { messages: (await state('slack')).messages.filter(x => x.channel === identity.approvalChannel) });
  });

  await phase('slow-cancel-doubleclick', async () => {
    await page.goto(identity.templateUrl); await page.locator('.react-flow__node[data-id="sheet"]').waitFor();
    await page.locator('.react-flow__node[data-id="slack"]').click();
    await page.getByTestId('node-drawer').getByText('Require human approval before running').click(); await closeDrawers(); await waitSaved();
    await fault({ provider: 'google_sheets', pathPattern: `${identity.sheetId}-fault`, mode: 'timeout', times: 1 });
    await page.getByRole('button', { name: '▶ Run' }).dblclick();
    await waitRunStatus('RUNNING', 30000);
    await page.getByText(/provider slow/).first().waitFor({ timeout: 20000 }); await shot('slow-provider');
    const other = await context.newPage();
    await other.goto(identity.localUrl); await other.locator('.react-flow__node').first().waitFor();
    await other.getByRole('button', { name: '▶ Run' }).click(); await other.getByTestId('run-dock').locator(':scope > div').first().getByText('Success', { exact: true }).waitFor({ timeout: 30000 }); await shot('other-flow-during-slow', other); await other.close();
    await page.getByTestId('run-dock').getByRole('button', { name: 'Cancel run' }).click();
    await waitRunStatus('CANCELLED', 10000); await shot('cancelled');
  });

  await phase('monitoring', async () => {
    await page.goto(`/w/${identity.slug}/flows`); await page.locator('table tbody tr').first().waitFor(); await shot('dashboard-before-repair');
    await page.goto(`/w/${identity.slug}/runs`); await page.getByRole('heading', { name: /Run history/ }).waitFor(); await shot('run-history');
    await page.getByRole('button', { name: 'Failed', exact: true }).click(); await shot('runs-failed-filter');
    await page.getByRole('button', { name: 'All runs', exact: true }).click();
    await page.getByLabel('Search flows or run number').fill('Lead Enrichment'); await shot('runs-search');
    await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /Lead Enrichment/ }).first().click();
    await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /Sheets — Add row/ }).first().click();
    await page.getByTestId('step-panel').getByRole('tab', { name: 'Log' }).click(); await shot('step-logs');
  });

  await phase('usage-budget', async () => {
    await page.goto(`/w/${identity.slug}/settings`); await page.getByRole('button', { name: 'Usage & limits' }).click();
    await page.getByRole('heading', { name: 'Usage this month' }).waitFor(); await shot('usage-before');
    await page.getByLabel('Monthly budget (USD)').fill('0.01');
    await page.getByRole('button', { name: '+ Add price' }).click();
    await page.getByLabel('Price key').last().fill('ai:ollama/fake-model');
    await page.getByLabel('Input per million tokens').last().fill('1000000');
    await page.getByLabel('Output per million tokens').last().fill('1000000');
    await page.getByRole('button', { name: 'Save limits' }).click(); await page.getByText('Usage limits saved').waitFor(); await shot('budget-saved');
    await page.goto(identity.templateUrl); await page.locator('.react-flow__node[data-id="sheet"]').waitFor();
    await page.getByRole('button', { name: '▶ Run' }).click(); await waitRunStatus('FAILED', 30000); await shot('budget-refused');
    await page.goto(`/w/${identity.slug}/settings`); await page.getByRole('button', { name: 'Usage & limits' }).click();
    await page.getByLabel('Monthly budget (USD)').fill(''); await page.getByRole('button', { name: 'Remove price' }).last().click();
    await page.getByRole('button', { name: 'Save limits' }).click(); await page.getByText('Usage limits saved').waitFor();
  });

  await phase('repair', async () => {
    await page.goto(`/w/${identity.slug}/flows`); await page.getByRole('button', { name: '+ New flow' }).click(); await page.getByText('Start with a trigger').waitFor();
    const pane = page.locator('.react-flow__pane');
    for (const [search,id,x] of [['webhook','palette-trigger.webhook',350],['action','palette-integration.action',600],['output','palette-output',850]]) {
      await page.getByRole('button', { name: /Add node/ }).click(); const palette = page.getByRole('dialog', { name: 'Add node' });
      await palette.getByLabel('Search nodes').fill(search); await palette.locator(`#${id.replaceAll('.', '\\.')}`).dragTo(pane, { targetPosition: { x, y: 480 } }); await closeDrawers();
    }
    const repairUrl = page.url(); const ids = await page.locator('.react-flow__node').evaluateAll(els => els.map(e => e.getAttribute('data-id')));
    await connectNodes(ids[0],ids[1]); await connectNodes(ids[1],ids[2]);
    await page.locator(`.react-flow__node[data-id="${ids[1]}"]`).click(); const drawer = page.getByTestId('node-drawer');
    await drawer.getByLabel('App').selectOption('slack'); await drawer.getByLabel('Action').selectOption('slack.post_message'); await pickConnection(drawer);
    await drawer.getByLabel('Input mapping (JSONata → object)').fill(`{ "channel": "${identity.repairChannel}", "text": "Retest repair" }`); await closeDrawers();
    await page.locator(`.react-flow__node[data-id="${ids[2]}"]`).click(); await drawer.getByLabel('Output key').fill('done'); await closeDrawers(); await waitSaved();
    await page.getByRole('button', { name: 'Publish', exact: true }).click(); await page.getByTestId('webhook-secret').waitFor();
    // The secret is one-time visible; close the panel before any screenshot/trace checkpoint.
    await page.getByRole('dialog', { name: 'Triggers' }).getByRole('button', { name: 'Close' }).click(); await shot('repair-active-builder');
    await page.goto(`/w/${identity.slug}/flows`); await page.locator('table tbody tr').first().waitFor(); await shot('dashboard-active');
    const r = await page.request.post(`${fake}/__fake/revoke-account`, { data: { account: 'a' } }); mark('revoke', { status: r.status(), body: scrub(await r.text()) });
    await page.goto(repairUrl); await page.locator('.react-flow__node').first().waitFor(); await runAndWait('FAILED'); await shot('repair-revoked-failed');
    await page.goto(`/w/${identity.slug}/integrations`); await shot('repair-banner');
    await page.goto(`/w/${identity.slug}/flows`); await page.locator('table tbody tr').first().waitFor(); await shot('dashboard-expired');
    await page.goto(identity.localUrl); await page.locator('.react-flow__node').first().waitFor(); await runAndWait('SUCCESS'); await shot('other-flow-while-expired');
    await page.goto(`/w/${identity.slug}/integrations`);
    await page.getByTestId('connection-slack').getByRole('button', { name: 'Reconnect' }).click(); await shot('reconnect-dialog');
    await page.getByRole('dialog', { name: 'Reconnect Slack' }).getByRole('button', { name: 'Continue to Slack' }).click();
    await page.getByTestId('connection-slack').getByText('Connected').waitFor({ timeout: 15000 }); await shot('reconnected');
    await page.goto(`/w/${identity.slug}/flows`); await page.locator('table tbody tr').first().waitFor(); await shot('dashboard-resumed');
    await page.goto(repairUrl); await page.locator('.react-flow__node').first().waitFor(); await runAndWait('SUCCESS'); await shot('repair-success');
    mark('repair-provider-state', { messages: (await state('slack')).messages.filter(x => x.channel === identity.repairChannel) });
    await page.goto(`/w/${identity.slug}/flows`); await page.locator('table tbody tr').first().waitFor(); await shot('dashboard-after-repair-success');
    await page.goto(`/w/${identity.slug}/integrations`);
    await page.getByTestId('connection-google_sheets').getByRole('button', { name: 'Reconnect' }).click(); await shot('reconnect-google-dialog');
    let hintSeen = false;
    const inspectHint = req => { try { const u = new URL(req.url()); if (u.pathname === '/oauth/authorize' && u.searchParams.has('login_hint')) { hintSeen = u.searchParams.get('login_hint') === 'alice@flowline.test'; mark('google-reconnect-hint', { origin: u.origin, pathname: u.pathname, hasLoginHint: true, matchesOriginalAccount: hintSeen }); } } catch {} };
    page.on('request', inspectHint);
    await page.getByRole('dialog', { name: 'Reconnect Google Sheets' }).getByRole('button', { name: 'Continue to Google Sheets' }).click();
    await page.getByTestId('connection-google_sheets').getByText('Connected').waitFor({ timeout: 15000 });
    page.off('request', inspectHint);
    mark('google-hint-result', { seen: hintSeen }); await shot('google-reconnected');
  });

  await phase('queue-limit', async () => {
    await page.goto(`/w/${identity.slug}/settings`); await page.getByRole('button', { name: 'Usage & limits' }).click();
    await page.getByLabel('Concurrent runs').fill('1'); await page.getByLabel('Queued runs').fill('1');
    await page.getByRole('button', { name: 'Save limits' }).click(); await page.getByText('Usage limits saved').waitFor(); await shot('queue-limits-saved');
    await fault({ provider: 'google_sheets', pathPattern: `${identity.sheetId}-fault`, mode: 'timeout', times: 1 });
    await page.goto(identity.templateUrl); await page.locator('.react-flow__node[data-id="sheet"]').waitFor();
    await page.getByRole('button', { name: '▶ Run' }).click(); await waitRunStatus('RUNNING', 30000); await shot('queue-first-running');
    const fid = identity.templateUrl.split('/').pop();
    const res1 = await page.request.post(`http://localhost:3100/api/flows/${fid}/runs`, { data: {}, headers: { origin: 'http://localhost:3100' } });
    mark('queue-second-client-1', { status: res1.status(), body: scrub(await res1.text()).slice(0, 800) }); await shot('queue-second-client-1-ui');
    const res2 = await page.request.post(`http://localhost:3100/api/flows/${fid}/runs`, { data: {}, headers: { origin: 'http://localhost:3100' } });
    mark('queue-second-client-2', { status: res2.status(), body: scrub(await res2.text()).slice(0, 800) }); await shot('queue-refusal-ui');
    if (await page.getByTestId('run-dock').getByRole('button', { name: 'Cancel run' }).count()) await page.getByTestId('run-dock').getByRole('button', { name: 'Cancel run' }).click();
    await page.goto(`/w/${identity.slug}/settings`); await page.getByRole('button', { name: 'Usage & limits' }).click();
    await page.getByLabel('Concurrent runs').fill('3'); await page.getByLabel('Queued runs').fill('100'); await page.getByRole('button', { name: 'Save limits' }).click(); await page.getByText('Usage limits saved').waitFor();
  });

  await phase('pagination', async () => {
    await page.goto(identity.localUrl); await page.locator('.react-flow__node').first().waitFor();
    for (let i = 0; i < 16; i++) {
      const header = page.getByTestId('run-dock').locator(':scope > div').first();
      const before = await header.textContent();
      await page.getByRole('button', { name: '▶ Run' }).click();
      await page.waitForFunction(old => document.querySelector('[data-testid="run-dock"] > div')?.textContent !== old, before, { timeout: 15000 });
      await header.getByText('Success', { exact: true }).waitFor({ timeout: 30000 });
      mark('pagination-run', { index: i + 1, header: (await header.innerText()).replace(/\s+/g, ' ').slice(0, 100) });
    }
    await page.goto(`/w/${identity.slug}/runs`);
    await page.getByRole('button', { name: 'Load older runs' }).waitFor({ timeout: 15000 }); await shot('load-older-before');
    await page.getByRole('button', { name: 'Load older runs' }).click();
    await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /#1.*Lead Enrichment Pipeline/ }).waitFor({ timeout: 15000 }); await shot('load-older-after');
  });
} catch (e) { mark('fatal', { error: scrub(e.stack || e).slice(0, 1800) }); }
finally { await save(); await browser.close(); }
