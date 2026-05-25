// Verifies double-click zoom: dbl-click a cell zooms it to fill + center;
// dbl-click empty space resets to the fitted view.
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DS = { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' };
// Small pump in a large canvas (transparent spacer enlarges the graph bounds) so
// the pump is small at fit and double-clicking it visibly zooms in.
const SXML = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="pump" value="P" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;" vertex="1" parent="1"><mxGeometry x="20" y="20" width="100" height="60" as="geometry"/></mxCell><mxCell id="spacer" value="" style="fillColor=none;strokeColor=none;" vertex="1" parent="1"><mxGeometry x="900" y="600" width="20" height="20" as="geometry"/></mxCell></root></mxGraphModel>';
const SOPT = () => ({ identifyBy: 'id', metadata: '', regex: true });
const SRULE = { id: 'r1', name: 'R', order: 1, hidden: false, metricPattern: '.*', column: '^pump$', aggregation: 'last', type: 'number', unit: 'short', decimals: 0, invert: false, gradient: false, iconState: false, thresholds: [{ color: '#ff9830', comparator: 'always', value: 0, level: 0, hidden: false }], tooltip: { enabled: false, label: '', colors: false, graph: false }, mappings: { shapes: { options: SOPT(), list: [{ id: 's1', pattern: '^pump$', hidden: false, style: 'fillColor', applyOn: 'a' }] }, texts: { options: SOPT(), list: [] }, links: { options: SOPT(), list: [] }, events: { options: SOPT(), list: [] } } };
async function makeDash(title) {
  const dash = { title, schemaVersion: 39, panels: [{ id: 1, type: 'softalink-hmidrawio-panel', title, datasource: DS, gridPos: { h: 12, w: 16, x: 0, y: 0 }, targets: [{ refId: 'A', scenarioId: 'raw_frame', datasource: DS, rawFrameContent: '[{"columns":[{"text":"pump","type":"number"}],"rows":[[60]]}]' }], options: { editorUrl: 'https://embed.diagrams.net/', editorTheme: 'kennedy', allowDrawioResources: false, flowcharts: [{ id: 'fc', name: 'Main', type: 'xml', download: false, url: '', xml: SXML, scale: true, center: true, grid: false, bgColor: null, zoom: '100%', lock: true, animation: false, tooltip: true }], rules: [SRULE] } }] };
  const r = await fetch(`${BASE}/api/dashboards/db`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify({ dashboard: dash, overwrite: true }) });
  return (await r.json()).uid;
}
let UID;

const results = [];
const check = (n, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${extra ? ` (${extra})` : ''}`); };

// Rect of the orange pump cell.
const pumpRect = () => {
  const e = [...document.querySelectorAll('[data-testid="hmi-diagram"] svg [fill]')].find(
    (x) => (x.getAttribute('fill') || '').toLowerCase() === '#ff9830'
  );
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1100, height: 800 } });
try {
  UID = await makeDash('static-dbl');
  const p = await ctx.newPage();
  await p.goto(`http://localhost:3000/d/${UID}?kiosk`, { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForSelector('[data-testid="hmi-diagram"] svg', { timeout: 30000 });
  await p.waitForTimeout(1300);

  const diag = await p.locator('[data-testid="hmi-diagram"]').first().boundingBox();
  const ccx = diag.x + diag.width / 2;
  const ccy = diag.y + diag.height / 2;

  const base = await p.evaluate(pumpRect);
  check('Diagram rendered with pump cell', base && base.w > 0, base ? `w ${Math.round(base.w)}` : 'none');

  // Double-click the pump cell -> zoom in + center.
  await p.mouse.dblclick(base.cx, base.cy);
  await p.waitForTimeout(400);
  const zoomed = await p.evaluate(pumpRect);
  check('Double-click cell zooms in (cell grows)', zoomed.w > base.w * 1.3, `${Math.round(base.w)} -> ${Math.round(zoomed.w)}px`);
  check('Zoomed cell is centered', Math.abs(zoomed.cx - ccx) < 40 && Math.abs(zoomed.cy - ccy) < 40,
    `center off by (${Math.round(zoomed.cx - ccx)}, ${Math.round(zoomed.cy - ccy)})`);

  // Double-click empty space (top-left corner) -> reset/refit.
  await p.mouse.dblclick(diag.x + 6, diag.y + 6);
  await p.waitForTimeout(400);
  const reset = await p.evaluate(pumpRect);
  check('Double-click empty space resets to fit', Math.abs(reset.w - base.w) < base.w * 0.15, `${Math.round(zoomed.w)} -> ${Math.round(reset.w)}px (base ${Math.round(base.w)})`);

  await p.close();
} catch (e) {
  check('dblclick-check ran without throwing', false, e.message);
} finally {
  await b.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
