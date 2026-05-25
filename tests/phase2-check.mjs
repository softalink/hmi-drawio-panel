// Phase 2 — Label/Text + Link mappings, verified at render level via the API.
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DS = { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' };
const XML = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="pump" value="Pump" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="160" height="80" as="geometry"/></mxCell></root></mxGraphModel>`;
const TARGET = { refId: 'A', scenarioId: 'raw_frame', datasource: DS, rawFrameContent: '[{"columns":[{"text":"pump","type":"number"}],"rows":[[85]]}]' };
const opts = () => ({ identifyBy: 'id', metadata: '', regex: true });
const base = (over = {}) => ({
  id: `r${Math.random().toString(36).slice(2)}`, name: 'r', order: 1, hidden: false,
  metricPattern: '.*', column: '^pump$', aggregation: 'last', type: 'number', unit: 'short', decimals: 0,
  invert: false, gradient: false, iconState: false,
  thresholds: [{ color: '#73BF69', comparator: 'always', value: 0, level: 0 }],
  tooltip: { enabled: false, label: '', colors: false, graph: false },
  mappings: {
    shapes: { options: opts(), list: [] }, texts: { options: opts(), list: [] },
    links: { options: opts(), list: [] }, events: { options: opts(), list: [] },
  },
  ...over,
});

async function createDashboard(title, rules) {
  const dashboard = {
    title, schemaVersion: 39,
    panels: [{ id: 1, type: 'softalink-hmidrawio-panel', title, datasource: DS, gridPos: { h: 10, w: 12, x: 0, y: 0 }, targets: [TARGET],
      options: { editorUrl: 'https://embed.diagrams.net/', editorTheme: 'kennedy', allowDrawioResources: false,
        flowcharts: [{ id: 'fc', name: 'Main', type: 'xml', download: false, url: '', xml: XML, scale: true, center: true, grid: false, bgColor: null, zoom: '100%', lock: true, animation: false, tooltip: true }],
        rules } }] };
  const res = await fetch(`${BASE}/api/dashboards/db`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify({ dashboard, overwrite: true }) });
  if (!res.ok) throw new Error(`create ${title}: ${res.status} ${await res.text()}`);
  return (await res.json()).uid;
}

const results = [];
const check = (n, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${extra ? ` (${extra})` : ''}`); };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
async function load(page, uid) {
  await page.goto(`${BASE}/d/${uid}?kiosk`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('[data-testid="hmi-diagram"] svg', { timeout: 30000 });
  await page.waitForTimeout(800);
}

try {
  // Text mapping: replace the pump label with the formatted value (85).
  const textRule = base({ mappings: { ...base().mappings, texts: { options: opts(), list: [{ id: 't1', pattern: '^pump$', hidden: false, textReplace: 'content', textPattern: '/.*/' }] } } });
  const uidT = await createDashboard('phase2-text', [textRule]);
  let page = await ctx.newPage();
  await load(page, uidT);
  const txt = await page.locator('[data-testid="hmi-diagram"] svg').first().evaluate((el) => el.textContent || '');
  check('Text mapping replaces the cell label with the value', txt.includes('85') && !txt.includes('Pump'), JSON.stringify(txt.slice(0, 40)));
  await page.close();

  // Link mapping: pump cell becomes a clickable link.
  const linkRule = base({ mappings: { ...base().mappings, links: { options: opts(), list: [{ id: 'l1', pattern: '^pump$', hidden: false, url: 'https://example.com/pump', params: false }] } } });
  const uidL = await createDashboard('phase2-link', [linkRule]);
  page = await ctx.newPage();
  await load(page, uidL);
  const hasLink = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="hmi-diagram"]');
    if (!root) return false;
    return [...root.querySelectorAll('a')].some((a) => (a.getAttribute('href') || a.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '').includes('example.com'));
  });
  check('Link mapping makes the cell a clickable link', hasLink);
  await page.close();
} catch (e) {
  check('phase2-check ran without throwing', false, e.message);
} finally {
  await b.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
