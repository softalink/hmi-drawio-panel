// Internal link mapping — clicking a cell with an Internal link performs an
// in-app (SPA) route change to the target dashboard, not a new-tab/full reload.
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DEMO = 'a538aeff-5a8a-42a5-901c-938d896fdd6f';
const TARGET = 'hmi-detail-0001';

const results = [];
const check = (n, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${extra ? ` (${extra})` : ''}`); };

async function provisioned(uid) {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${BASE}/api/search?type=dash-db`, { headers: { Authorization: AUTH } })).json();
    if (list.some((d) => d.uid === uid)) { return true; }
    await new Promise((s) => setTimeout(s, 2000));
  }
  return false;
}

const b = await chromium.launch();
try {
  check('internal-link target dashboard provisioned', await provisioned(TARGET));

  const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
  await p.goto(`${BASE}/d/${DEMO}?kiosk`, { waitUntil: 'networkidle', timeout: 40000 });
  // The Pump cell carries an Internal link -> it must render as an internal anchor.
  await p.waitForSelector('[data-testid="hmi-diagram"] a[data-hmi-internal="1"]', { timeout: 40000 });
  check('cell wrapped as an internal link (data-hmi-internal=1)', true);

  // A value set on window survives only if navigation is SPA (a full reload clears it).
  await p.evaluate(() => { window.__hmiNav = 'kept'; });
  await p.click('[data-testid="hmi-diagram"] a[data-hmi-internal="1"]');
  await p.waitForFunction((uid) => location.pathname.includes(uid), TARGET, { timeout: 15000 });

  const spa = await p.evaluate(() => window.__hmiNav);
  const path = await p.evaluate(() => location.pathname);
  check('navigated to the target dashboard (clean root path)', path.startsWith(`/d/${TARGET}`), path);
  check('navigation was in-app SPA (no full reload)', spa === 'kept');
} catch (e) {
  check('internal-link-check ran without throwing', false, e.message);
} finally {
  await b.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
