// Render-level checks for the new items: per-mapping "When" gating (item 1) and
// hidden thresholds (item 5).
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DS = { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' };
const XML = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="pump" value="Pump" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;" vertex="1" parent="1"><mxGeometry x="60" y="60" width="180" height="90" as="geometry"/></mxCell></root></mxGraphModel>`;
const opts = () => ({ identifyBy: 'id', metadata: '', regex: true });
const target = (v) => ({ refId: 'A', scenarioId: 'raw_frame', datasource: DS, rawFrameContent: `[{"columns":[{"text":"pump","type":"number"}],"rows":[[${v}]]}]` });

function rule(thresholds, shapeApplyOn) {
  return {
    id: 'r1', name: 'Pump', order: 1, hidden: false,
    metricPattern: '.*', column: '^pump$', aggregation: 'last', type: 'number', unit: 'short', decimals: 0,
    invert: false, gradient: false, iconState: false, thresholds,
    tooltip: { enabled: false, label: '', colors: false, graph: false },
    mappings: {
      shapes: { options: opts(), list: [{ id: 's1', pattern: '^pump$', hidden: false, style: 'fillColor', applyOn: shapeApplyOn }] },
      texts: { options: opts(), list: [] }, links: { options: opts(), list: [] }, events: { options: opts(), list: [] },
    },
  };
}

async function createDashboard(title, value, rules) {
  const dashboard = { title, schemaVersion: 39, panels: [{ id: 1, type: 'softalink-hmidrawio-panel', title, datasource: DS, gridPos: { h: 10, w: 12, x: 0, y: 0 }, targets: [target(value)],
    options: { editorUrl: 'https://embed.diagrams.net/', editorTheme: 'kennedy', allowDrawioResources: false,
      flowcharts: [{ id: 'fc', name: 'Main', type: 'xml', download: false, url: '', xml: XML, scale: true, center: true, grid: false, bgColor: null, zoom: '100%', lock: true, animation: false, tooltip: true }], rules } }] };
  const res = await fetch(`${BASE}/api/dashboards/db`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify({ dashboard, overwrite: true }) });
  if (!res.ok) throw new Error(`create ${title}: ${res.status} ${await res.text()}`);
  return (await res.json()).uid;
}

const ladder = (greenHidden = false) => [
  { color: '#F2495C', comparator: 'always', value: 0, level: 2, hidden: false },
  { color: '#FF9830', comparator: 'ge', value: 50, level: 1, hidden: false },
  { color: '#73BF69', comparator: 'ge', value: 80, level: 0, hidden: greenHidden },
];

const results = [];
const check = (n, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${extra ? ` (${extra})` : ''}`); };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
async function fills(uid) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/d/${uid}?kiosk`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('[data-testid="hmi-diagram"] svg', { timeout: 30000 });
  await page.waitForTimeout(900);
  const f = await page.evaluate(() => {
    const s = new Set();
    document.querySelectorAll('[data-testid="hmi-diagram"] svg [fill]').forEach((el) => s.add((el.getAttribute('fill') || '').toLowerCase()));
    return [...s];
  });
  await page.close();
  return f;
}

try {
  // Item 1: When=Warning/Critical (wc) — NOT colored at level 0, colored at level 1.
  const okUid = await createDashboard('item-wc-ok', 85, [rule(ladder(), 'wc')]); // value 85 -> level 0
  const okFills = await fills(okUid);
  check('When=Warning/Critical skips coloring at OK level', okFills.includes('#dae8fc') && !okFills.includes('#73bf69'), okFills.join(','));

  const warnUid = await createDashboard('item-wc-warn', 60, [rule(ladder(), 'wc')]); // value 60 -> level 1
  const warnFills = await fills(warnUid);
  check('When=Warning/Critical colors at warning level', warnFills.includes('#ff9830'), warnFills.join(','));

  // Item 5: a hidden threshold is skipped during evaluation. value 85 would be
  // green (ge80); hiding green makes it fall through to the next match (ge50 orange).
  const hidUid = await createDashboard('item-th-hidden', 85, [rule(ladder(true), 'a')]);
  const hidFills = await fills(hidUid);
  check('Hidden threshold is skipped (85 falls green→orange)', hidFills.includes('#ff9830') && !hidFills.includes('#73bf69'), hidFills.join(','));
} catch (e) {
  check('items-render-check ran without throwing', false, e.message);
} finally {
  await b.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
