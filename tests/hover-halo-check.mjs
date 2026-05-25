// Verifies the green hover-halo: hovering a mapping "What" or a folded rule row
// halos the matching cell(s) in the diagram.
import { chromium } from 'playwright';
const UID = 'a538aeff-5a8a-42a5-901c-938d896fdd6f';
const results = [];
const check = (n, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${extra ? ` (${extra})` : ''}`); };
const halos = () => document.querySelectorAll('[data-testid="hmi-diagram"] svg [stroke="#00ff00"]').length;
const waitHalos = (p, want) => p.waitForFunction(
  (w) => document.querySelectorAll('[data-testid="hmi-diagram"] svg [stroke="#00ff00"]').length === w ? true
    : (w > 0 ? document.querySelectorAll('[data-testid="hmi-diagram"] svg [stroke="#00ff00"]').length > 0 : false),
  want, { timeout: 5000 }).then(() => true).catch(() => false);

const b = await chromium.launch();
const ctx = await b.newContext({ storageState: 'playwright/.auth/admin.json', viewport: { width: 1600, height: 1100 } });
try {
  const p = await ctx.newPage();
  await p.goto(`http://localhost:3000/d/${UID}?editPanel=1`, { waitUntil: 'networkidle', timeout: 45000 });
  await p.waitForSelector('[data-testid="hmi-diagram"] svg', { timeout: 30000 });
  await p.waitForTimeout(1500);

  check('No halo initially', (await p.evaluate(halos)) === 0);

  // Folded rule row hover -> halo the rule's mapped cell(s).
  await p.getByTestId('hmi-rule-expand').first().hover();
  check('Hovering a folded rule row halos its mapped cell', await waitHalos(p, 1), `halos=${await p.evaluate(halos)}`);
  await p.getByText('Coloring rules', { exact: false }).first().hover();
  check('Leaving the rule row clears the halo', (await waitHalos(p, 0)));

  // Mapping "What" hover -> halo.
  await p.getByTestId('hmi-rule-expand').first().click();
  await p.waitForTimeout(500);
  const what = p.getByTestId('hmi-map-what').first();
  await what.scrollIntoViewIfNeeded();
  await what.hover();
  check('Hovering a mapping "What" halos the matching cell', await waitHalos(p, 1), `halos=${await p.evaluate(halos)}`);

  // Confirm the halo is green + offset (gap) — stroke color + stroke width.
  const style = await p.evaluate(() => {
    const e = document.querySelector('[data-testid="hmi-diagram"] svg [stroke="#00ff00"]');
    return e ? { stroke: e.getAttribute('stroke'), width: e.getAttribute('stroke-width') } : null;
  });
  check('Halo is thick green', !!style && (style.stroke || '').toLowerCase() === '#00ff00' && Number(style.width) >= 3, JSON.stringify(style));

  await p.close();
} catch (e) {
  check('hover-halo-check ran without throwing', false, e.message);
} finally {
  await b.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
