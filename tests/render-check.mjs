// Render check for the provisioned showcase dashboard (random data), asserting
// facts that hold regardless of the random value: the diagram renders, a
// threshold color is applied, the Text mapping shows a numeric value, and the
// Link mapping produces a clickable <a>.
import { chromium } from 'playwright';

const BASE = process.env.GRAFANA_URL || 'http://localhost:3000';
const UID = 'a538aeff-5a8a-42a5-901c-938d896fdd6f';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const results = [];
const check = (n, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${extra ? ` (${extra})` : ''}`); };

try {
  await page.goto(`${BASE}/d/${UID}?kiosk`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('[data-testid="hmi-diagram"] svg', { timeout: 30000 });

  // Poll for a settled threshold color — the demo animates color changes, so a
  // single sample can land mid-fade (an intermediate hex). Between 5s refreshes
  // the fade settles to an exact threshold color.
  const threshold = await page
    .waitForFunction(
      () => {
        const fills = new Set();
        document.querySelectorAll('[data-testid="hmi-diagram"] svg [fill]').forEach((e) => fills.add((e.getAttribute('fill') || '').toLowerCase()));
        const hit = ['#73bf69', '#ff9830', '#f2495c'].filter((c) => fills.has(c));
        return hit.length ? hit : false;
      },
      null,
      { timeout: 10000, polling: 300 }
    )
    .then((h) => h.jsonValue())
    .catch(() => null);

  const facts = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="hmi-diagram"]');
    const svg = root.querySelector('svg');
    const text = (svg && svg.textContent) || '';
    // The demo pump carries an Internal link -> a clickable in-app anchor.
    const link = [...root.querySelectorAll('a[data-hmi-link]')].some(
      (a) => ((a.getAttribute('href') || a.getAttributeNS('http://www.w3.org/1999/xlink', 'href')) || '').includes('/d/hmi-detail')
    );
    return { hasSvg: !!svg, hasDigit: /\d/.test(text), link };
  });

  check('Showcase diagram renders an SVG', facts.hasSvg);
  check('A threshold color is applied to a cell', !!threshold, threshold ? threshold.join(',') : 'none');
  check('Text mapping shows a numeric value (tank)', facts.hasDigit);
  check('Link mapping renders a clickable cell (pump)', facts.link);

  await page.screenshot({ path: 'tests/render-check.png' });
} catch (e) {
  check('render-check ran without throwing', false, e.message);
} finally {
  await browser.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
