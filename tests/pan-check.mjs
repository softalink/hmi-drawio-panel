// Verifies left-drag panning moves the diagram view, and a plain click does not.
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DS = { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' };
const SXML = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="pump" value="P" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;" vertex="1" parent="1"><mxGeometry x="20" y="20" width="320" height="180" as="geometry"/></mxCell></root></mxGraphModel>';
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

// On-screen x of the orange pump cell — shifts when the view pans.
const cellX = () => {
  const e = [...document.querySelectorAll('[data-testid="hmi-diagram"] svg [fill]')].find(
    (x) => (x.getAttribute('fill') || '').toLowerCase() === '#ff9830'
  );
  return e ? e.getBoundingClientRect().x : null;
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1100, height: 800 } });
try {
  UID = await makeDash('static-pan');
  const p = await ctx.newPage();
  await p.goto(`http://localhost:3000/d/${UID}?kiosk`, { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForSelector('[data-testid="hmi-diagram"] svg', { timeout: 30000 });
  await p.waitForTimeout(1200);

  const before = await p.evaluate(cellX);
  check('Diagram rendered with a measurable cell', before != null, `x ${Math.round(before)}`);

  const diag = await p.locator('[data-testid="hmi-diagram"]').first().boundingBox();
  const cx = diag.x + diag.width / 2;
  const cy = diag.y + diag.height / 2;

  // Plain click (no movement) must NOT pan.
  await p.mouse.move(cx, cy);
  await p.mouse.down();
  await p.mouse.up();
  await p.waitForTimeout(150);
  const afterClick = await p.evaluate(cellX);
  check('Plain click does NOT pan', Math.abs(afterClick - before) < 2, `x ${Math.round(afterClick)}`);

  // Left-drag right+down by (140, 90) should shift the content by ~the same.
  const DX = 140;
  await p.mouse.move(cx, cy);
  await p.mouse.down();
  await p.mouse.move(cx + DX, cy + 90, { steps: 12 });
  await p.mouse.up();
  await p.waitForTimeout(200);
  const afterDrag = await p.evaluate(cellX);
  const shift = afterDrag - before;
  check('Left-drag pans the view (content shifts with the drag)', shift > DX * 0.6, `Δx ${Math.round(shift)}px (dragged ${DX})`);

  await p.close();
} catch (e) {
  check('pan-check ran without throwing', false, e.message);
} finally {
  await b.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
