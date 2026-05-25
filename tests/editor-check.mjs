// Drives the panel editor UI to verify the foldable Flowcharts table:
//  - rows are collapsed by default (no detail form shown)
//  - the table header columns are present
//  - expanding a row reveals the detail form (Source Content + buttons)
//  - Prettify/Minify transform the source; Add flowchart adds a row
//  - the collapsed-row Options icons are INTERACTIVE (toggling Grid sets the
//    diagram's background grid without expanding the row)
// Uses the admin auth state created by `npm run e2e`.
import { chromium } from 'playwright';

const UID = 'a538aeff-5a8a-42a5-901c-938d896fdd6f';
const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${extra ? ` (${extra})` : ''}`);
};

const b = await chromium.launch();
const ctx = await b.newContext({ storageState: 'playwright/.auth/admin.json', viewport: { width: 1600, height: 1000 } });
const p = await ctx.newPage();

try {
  await p.goto(`http://localhost:3000/d/${UID}?editPanel=1`, { waitUntil: 'networkidle', timeout: 45000 });
  await p.waitForTimeout(2000);
  const closeBtn = p.locator('[role="dialog"] button[aria-label*="Close" i]').first();
  if (await closeBtn.count()) {
    await closeBtn.click().catch(() => {});
  }

  await p.getByTestId('hmi-fc-expand').first().waitFor({ timeout: 15000 });

  // Header columns present.
  check('Table header shows the original columns',
    (await p.getByText('Flowchart name', { exact: false }).count()) >= 1 &&
    (await p.getByText('Options', { exact: false }).count()) >= 1 &&
    (await p.getByText('BG Col.', { exact: false }).count()) >= 1);

  // Collapsed by default: no detail form / Source Content visible yet.
  check('Rows are collapsed by default', (await p.getByTestId('hmi-fc-detail').count()) === 0);

  // Expand the first row -> detail form appears.
  await p.getByTestId('hmi-fc-expand').first().click();
  const textarea = p.locator('textarea[placeholder*="draw.io XML"]');
  await textarea.waitFor({ timeout: 10000 });
  check('Expanding a row reveals the detail form', (await p.getByTestId('hmi-fc-detail').count()) >= 1);

  // Minify -> single line; Prettify -> multi-line.
  await p.getByRole('button', { name: 'Minify' }).click();
  await p.waitForTimeout(300);
  const mini = await textarea.inputValue();
  check('Minify collapses Source Content to one line', !mini.includes('\n') && mini.includes('<mxCell'));
  await p.getByRole('button', { name: 'Prettify' }).click();
  await p.waitForTimeout(300);
  const pretty = await textarea.inputValue();
  check('Prettify re-expands Source Content', pretty.split('\n').length > 1 && pretty.includes('<mxCell'));

  // Collapse it again before testing the interactive icons.
  await p.getByTestId('hmi-fc-expand').first().click();
  await p.waitForTimeout(300);
  check('Row collapses again', (await p.getByTestId('hmi-fc-detail').count()) === 0);

  // Interactive Options icon: toggle Grid from the collapsed row, assert the
  // diagram layer gets a background grid image (proves the icon drives render).
  const gridBefore = await p
    .locator('[data-testid="hmi-diagram"] > div')
    .first()
    .evaluate((el) => el.style.backgroundImage);
  await p.locator('button[title^="Grid:"]').first().click();
  const gridApplied = await p
    .waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="hmi-diagram"] > div');
        return !!el && el.style.backgroundImage.includes('url(');
      },
      null,
      { timeout: 8000 }
    )
    .then(() => true)
    .catch(() => false);
  check('Collapsed-row Grid icon toggles the diagram grid', gridApplied, `before="${gridBefore}"`);
  await p.locator('button[title^="Grid:"]').first().click(); // restore

  // Add flowchart -> a new expand toggle (row) appears.
  const rowsBefore = await p.getByTestId('hmi-fc-expand').count();
  await p.getByRole('button', { name: 'Add flowchart' }).click();
  await p.waitForTimeout(500);
  const rowsAfter = await p.getByTestId('hmi-fc-expand').count();
  check('Add flowchart adds a row', rowsAfter === rowsBefore + 1, `rows ${rowsBefore} -> ${rowsAfter}`);
} catch (e) {
  check('editor-check ran without throwing', false, e.message);
} finally {
  await p.screenshot({ path: 'tests/editor-check.png' }).catch(() => {});
  await b.close();
}

process.exit(results.every(Boolean) ? 0 : 1);
