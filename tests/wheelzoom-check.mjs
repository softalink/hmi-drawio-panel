// Verifies Ctrl/⌘+wheel zooms the diagram (cells grow/shrink) while a plain
// wheel does not (so the dashboard still scrolls).
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

// Width (screen px) of the orange pump cell — grows when zoomed in.
const cellWidth = () =>
  ([...document.querySelectorAll('[data-testid="hmi-diagram"] svg [fill]')]
    .find((e) => (e.getAttribute('fill') || '').toLowerCase() === '#ff9830')?.getBoundingClientRect().width) || 0;

function dispatchWheel({ deltaY, ctrl }) {
  const c = document.querySelector('[data-testid="hmi-diagram"] > div');
  const r = c.getBoundingClientRect();
  c.dispatchEvent(new WheelEvent('wheel', {
    deltaY, ctrlKey: ctrl, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true,
  }));
}

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1100, height: 800 } });
try {
  UID = await makeDash('static-wheel');
  const p = await ctx.newPage();
  await p.goto(`http://localhost:3000/d/${UID}?kiosk`, { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForSelector('[data-testid="hmi-diagram"] svg', { timeout: 30000 });
  await p.waitForTimeout(1200);

  const base = await p.evaluate(cellWidth);
  check('Diagram rendered with a measurable cell', base > 0, `width ${Math.round(base)}px`);

  // Plain wheel -> no zoom.
  await p.evaluate(dispatchWheel, { deltaY: 120, ctrl: false });
  await p.waitForTimeout(150);
  const afterPlain = await p.evaluate(cellWidth);
  check('Plain wheel does NOT zoom', Math.abs(afterPlain - base) < 1, `width ${Math.round(afterPlain)}px`);

  // Ctrl+wheel up -> zoom in (cell grows).
  for (let i = 0; i < 3; i++) {
    await p.evaluate(dispatchWheel, { deltaY: -120, ctrl: true });
    await p.waitForTimeout(80);
  }
  const afterIn = await p.evaluate(cellWidth);
  check('Ctrl+wheel up zooms in (cell grows)', afterIn > base * 1.1, `${Math.round(base)} -> ${Math.round(afterIn)}px`);

  // Ctrl+wheel down -> zoom out (cell shrinks back).
  for (let i = 0; i < 3; i++) {
    await p.evaluate(dispatchWheel, { deltaY: 120, ctrl: true });
    await p.waitForTimeout(80);
  }
  const afterOut = await p.evaluate(cellWidth);
  check('Ctrl+wheel down zooms out (cell shrinks)', afterOut < afterIn * 0.95, `${Math.round(afterIn)} -> ${Math.round(afterOut)}px`);

  await p.close();
} catch (e) {
  check('wheelzoom-check ran without throwing', false, e.message);
} finally {
  await b.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
