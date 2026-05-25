// Verifies that while the "What" dropdown is open, hovering options moves the
// halo to the cell each option matches.
import { chromium } from 'playwright';
const UID = 'a538aeff-5a8a-42a5-901c-938d896fdd6f';
const results = [];
const check = (n, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${extra ? ` (${extra})` : ''}`); };
const haloX = () => {
  const e = document.querySelector('[data-testid="hmi-diagram"] svg [stroke="#00ff00"]');
  return e ? Math.round(e.getBoundingClientRect().x) : null;
};

const b = await chromium.launch();
const ctx = await b.newContext({ storageState: 'playwright/.auth/admin.json', viewport: { width: 1600, height: 1100 } });
try {
  const p = await ctx.newPage();
  await p.goto(`http://localhost:3000/d/${UID}?editPanel=1`, { waitUntil: 'networkidle', timeout: 45000 });
  await p.waitForSelector('[data-testid="hmi-diagram"] svg', { timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.getByTestId('hmi-rule-expand').first().click();
  await p.waitForTimeout(500);

  // Open the first (Color/Tooltip) mapping's What dropdown.
  await p.getByTestId('hmi-map-what').first().getByRole('combobox').click();
  await p.waitForTimeout(300);
  check('Dropdown lists cell options', (await p.getByRole('option', { name: 'valve' }).count()) >= 1);

  // Hover "valve" -> halo the valve cell.
  await p.getByRole('option', { name: 'valve', exact: true }).hover();
  const okValve = await p.waitForFunction(() => !!document.querySelector('[data-testid="hmi-diagram"] svg [stroke="#00ff00"]'), null, { timeout: 5000 }).then(() => true).catch(() => false);
  const xValve = await p.evaluate(haloX);
  check('Hovering "valve" option halos a cell', okValve && xValve != null, `x=${xValve}`);

  // Hover "sensor" -> halo moves to the sensor cell (different x).
  await p.getByRole('option', { name: 'sensor', exact: true }).hover();
  await p.waitForTimeout(300);
  const xSensor = await p.evaluate(haloX);
  check('Halo follows to "sensor" option (moves)', xSensor != null && Math.abs(xSensor - xValve) > 20, `valve x=${xValve}, sensor x=${xSensor}`);

  await p.close();
} catch (e) {
  check('hover-option-check ran without throwing', false, e.message);
} finally {
  await b.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
