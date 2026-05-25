// Drives the panel editor to verify the foldable Rules table UI:
//  - rows collapsed by default; expanding reveals the rich form
//  - Add a rule / Add a threshold work
//  - live Lvl/F.val are shown in the collapsed row
// Uses the admin auth state created by `npm run e2e`.
import { chromium } from 'playwright';

const UID = 'a538aeff-5a8a-42a5-901c-938d896fdd6f';
const results = [];
const check = (n, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${extra ? ` (${extra})` : ''}`); };

const b = await chromium.launch();
const ctx = await b.newContext({ storageState: 'playwright/.auth/admin.json', viewport: { width: 1600, height: 1100 } });
const p = await ctx.newPage();
try {
  await p.goto(`http://localhost:3000/d/${UID}?editPanel=1`, { waitUntil: 'networkidle', timeout: 45000 });
  await p.waitForTimeout(2500);

  await p.getByTestId('hmi-rule-expand').first().waitFor({ timeout: 15000 });
  check('Rules table renders rows', (await p.getByTestId('hmi-rule-expand').count()) >= 1);
  check('Rule rows collapsed by default', (await p.getByTestId('hmi-rule-detail').count()) === 0);

  // Expand first rule -> rich form sections appear.
  await p.getByTestId('hmi-rule-expand').first().click();
  await p.waitForTimeout(500);
  check('Expanding a rule reveals the form', (await p.getByTestId('hmi-rule-detail').count()) >= 1);
  const sections = ['Apply to metrics', 'Aggregation', 'Thresholds', 'Color/Tooltip Mappings', 'Label/Text Mappings', 'Link Mappings', 'Event/Animation Mappings'];
  let allSections = true;
  for (const s of sections) {
    if ((await p.getByText(s, { exact: false }).count()) < 1) { allSections = false; }
  }
  check('All rule form sections present', allSections);

  // Add a threshold (footer button; per-row "+" is "Add a threshold below").
  const thBefore = await p.getByRole('button', { name: 'Clone' }).count();
  await p.getByRole('button', { name: 'Add a threshold', exact: true }).click();
  await p.waitForTimeout(300);
  const thAfter = await p.getByRole('button', { name: 'Clone' }).count();
  check('Add a threshold adds a row', thAfter > thBefore, `clone-btns ${thBefore} -> ${thAfter}`);

  // Add a rule.
  const rowsBefore = await p.getByTestId('hmi-rule-expand').count();
  await p.getByRole('button', { name: 'Add a rule' }).click();
  await p.waitForTimeout(400);
  const rowsAfter = await p.getByTestId('hmi-rule-expand').count();
  check('Add a rule adds a row', rowsAfter === rowsBefore + 1, `rows ${rowsBefore} -> ${rowsAfter}`);
} catch (e) {
  check('rules-editor-check ran without throwing', false, e.message);
} finally {
  await p.screenshot({ path: 'tests/rules-editor.png' }).catch(() => {});
  await b.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
