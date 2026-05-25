// Phase 4 — Tooltips (Display metrics + sparkline), verified via the API.
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DS = { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' };
const XML = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="pump" value="Pump" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;" vertex="1" parent="1"><mxGeometry x="60" y="60" width="180" height="90" as="geometry"/></mxCell></root></mxGraphModel>`;
// three rows -> sparkline has multiple points; aggregation last -> 85
const TARGET = { refId: 'A', scenarioId: 'raw_frame', datasource: DS, rawFrameContent: '[{"columns":[{"text":"pump","type":"number"}],"rows":[[80],[82],[85]]}]' };
const opts = () => ({ identifyBy: 'id', metadata: '', regex: true });

const rule = {
  id: 'r1', name: 'Pump', order: 1, hidden: false,
  metricPattern: '.*', column: '^pump$', aggregation: 'last', type: 'number', unit: 'short', decimals: 0,
  invert: false, gradient: false, iconState: false,
  thresholds: [{ color: '#73BF69', comparator: 'always', value: 0, level: 0 }],
  tooltip: { enabled: true, label: 'Pump', colors: true, graph: true },
  mappings: {
    shapes: { options: opts(), list: [{ id: 's1', pattern: '^pump$', hidden: false, style: 'fillColor' }] },
    texts: { options: opts(), list: [] }, links: { options: opts(), list: [] }, events: { options: opts(), list: [] },
  },
};

async function createDashboard(title, rules) {
  const dashboard = { title, schemaVersion: 39, panels: [{ id: 1, type: 'softalink-hmidrawio-panel', title, datasource: DS, gridPos: { h: 10, w: 12, x: 0, y: 0 }, targets: [TARGET],
    options: { editorUrl: 'https://embed.diagrams.net/', editorTheme: 'kennedy', allowDrawioResources: false,
      flowcharts: [{ id: 'fc', name: 'Main', type: 'xml', download: false, url: '', xml: XML, scale: true, center: true, grid: false, bgColor: null, zoom: '100%', lock: true, animation: false, tooltip: true }], rules } }] };
  const res = await fetch(`${BASE}/api/dashboards/db`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify({ dashboard, overwrite: true }) });
  if (!res.ok) throw new Error(`create: ${res.status} ${await res.text()}`);
  return (await res.json()).uid;
}

const results = [];
const check = (n, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${extra ? ` (${extra})` : ''}`); };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
try {
  const uid = await createDashboard('phase4-tooltip', [rule]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/d/${uid}?kiosk`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('[data-testid="hmi-diagram"] svg', { timeout: 30000 });
  await page.waitForTimeout(900);

  const title = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="hmi-diagram"] svg title')].map((t) => t.textContent || '').find((t) => t.includes('Pump')) || ''
  );
  check('Tooltip sets an SVG <title> with the value', title.includes('Pump') && title.includes('85'), JSON.stringify(title));

  const tip = await page.evaluate(() => {
    const node = [...document.querySelectorAll('[data-testid="hmi-diagram"] *')].find((e) => e.__hmiTip);
    if (!node) return null;
    node.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 120, clientY: 120 }));
    const t = document.querySelector('.hmi-tooltip');
    return t ? { display: getComputedStyle(t).display, html: t.innerHTML } : null;
  });
  check('Hover shows the custom tooltip with the value', !!tip && tip.display === 'block' && tip.html.includes('85'));
  check('Tooltip graph renders a sparkline', !!tip && tip.html.includes('<polyline'));

  await page.close();
} catch (e) {
  check('phase4-check ran without throwing', false, e.message);
} finally {
  await b.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
