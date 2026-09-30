import { readFile, writeFile } from 'node:fs/promises';
const root = 'artifacts/design-v2/chrome-qa/final-keyboard';
const rows = [];
for (const session of ['session-e', 'session-f', 'session-g', 'session-h']) {
  const checks = JSON.parse(await readFile(`${root}/${session}/checks.json`, 'utf8'));
  for (const [i, c] of checks.entries()) {
    const invalid = session === 'session-e' && c.id === 'ar:phone-navigation';
    const detail = c.mode ? `${c.mode}; initial=${c.initial}; Tab outside=${c.tabOutside}; Escape=${c.escape}; return=${c.returned}; body loss=${c.bodyLoss}` : c.note ?? (c.cancelledWithoutChange !== undefined ? `Native select: Escape preserves value=${c.cancelledWithoutChange}; return=${c.returned}` : 'See JSON assertion');
    rows.push(`| ${session}/${i+1} | ${c.id} | ${c.name ?? ''} | ${invalid ? 'INVALID ATTEMPT (raw FAIL)' : c.result} | ${detail.replaceAll('|','/')} |`);
  }
}
await writeFile(`${root}/SURFACES.md`, `# Journey 9 individual surface results\n\nFinal checkpoint 20: \`64e825709fb79ef8cffcb19c3f0791b940bf844f\`. E/F exhaustively sweep cp16; G retests builder.tsx on cp18 (identical blob in cp20); H retests integration removal on cp20. All other product sources are byte-identical to cp16: see source-delta-cp16-cp20.json and REPORT.md. Every row links by session and 1-based JSON array position to checks.json.\n\n226 recorded checks: 225 PASS, one invalid launcher attempt retained as raw FAIL. The invalid Arabic attempt opened the run row rather than navigation; \`ar:phone-navigation-corrected-launcher\` repeats the intended menu and passes. There is no unresolved product FAIL in the final lifecycle sweep.\n\nFor modal layers, forward/reverse Tab loops stay inside. Non-modal layers allow leaving; Escape is tested from inside the layer (outside focus belongs to the page). Menus use their own keyboard behavior. Surface activation uses Playwright keyboard Enter after focusing the real launcher. G additionally uses a pointer click to verify the mouse-selection regression. Focus labels omit input values.\n\n| Record | Surface/check | Accessible name | Result | Evidence |\n|---|---|---|---|---|\n${rows.join('\n')}\n`);
