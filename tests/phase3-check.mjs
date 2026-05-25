// Phase 3 — Event/Animation mappings, verified at render level via the API.
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DS = { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' };
const XML = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="pump" value="Pump" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1"><mxGeometry x="60" y="60" width="160" height="80" as="geometry"/></mxCell></root></mxGraphModel>`;
const TARGET = { refId: 'A', scenarioId: 'raw_frame', datasource: DS, rawFrameContent: '[{"columns":[{"text":"pump","type":"number"}],"rows":[[85]]}]' };
const opts = () => ({ identifyBy: 'id', metadata: '', regex: true });

function ruleWithEvent(ev) {
  return {
    id: `r${Math.random().toString(36).slice(2)}`, name: 'r', order: 1, hidden: false,
    metricPattern: '.*', column: '^pump$', aggregation: 'last', type: 'number', unit: 'short', decimals: 0,
    invert: false, gradient: false, iconState: false,
    thresholds: [{ color: '#73BF69', comparator: 'always', value: 0, level: 0 }],
    tooltip: { enabled: false, label: '', colors: false, graph: false },
    mappings: {
      shapes: { options: opts(), list: [] }, texts: { options: opts(), list: [] }, links: { options: opts(), list: [] },
      events: { options: opts(), list: [{ id: 'e1', pattern: '^pump$', hidden: false, comparator: 'ge', level: 0, ...ev }] },
    },
  };
}

async function createDashboard(title, rules) {
  const dashboard = { title, schemaVersion: 39, panels: [{ id: 1, type: 'softalink-hmidrawio-panel', title, datasource: DS, gridPos: { h: 10, w: 12, x: 0, y: 0 }, targets: [TARGET],
    options: { editorUrl: 'https://embed.diagrams.net/', editorTheme: 'kennedy', allowDrawioResources: false,
      flowcharts: [{ id: 'fc', name: 'Main', type: 'xml', download: false, url: '', xml: XML, scale: true, center: true, grid: false, bgColor: null, zoom: '100%', lock: true, animation: false, tooltip: true }], rules } }] };
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
  await page.waitForTimeout(900);
}

async function run(title, ev, assertFn, label) {
  const uid = await createDashboard(title, [ruleWithEvent(ev)]);
  const page = await ctx.newPage();
  await load(page, uid);
  const ok = await page.evaluate(assertFn);
  check(label, !!ok, typeof ok === 'string' ? ok : '');
  await page.close();
}

try {
  await run('phase3-blink', { method: 'blink', value: '400' }, () =>
    [...document.querySelectorAll('[data-testid="hmi-diagram"] *')].some((e) => e.style && (e.style.animation || '').includes('hmi-blink')),
    'Blink event animates a cell (hmi-blink)');

  await run('phase3-rotation', { method: 'rotation', value: '45' }, () =>
    [...document.querySelectorAll('[data-testid="hmi-diagram"] *')].some((e) => ((e.getAttribute && e.getAttribute('transform')) || '').includes('rotate(')),
    'Rotation event rotates a cell (transform rotate)');

  await run('phase3-opacity', { method: 'opacity', value: '30' }, () =>
    [...document.querySelectorAll('[data-testid="hmi-diagram"] *')].some((e) => {
      const o = (e.getAttribute && (e.getAttribute('opacity') || e.getAttribute('fill-opacity'))) || (e.style && e.style.opacity);
      const n = parseFloat(o);
      return !isNaN(n) && n > 0 && n < 1;
    }),
    'Opacity event makes a cell semi-transparent');

  await run('phase3-visibility', { method: 'visibility', value: '0' }, () => {
    const fills = new Set();
    document.querySelectorAll('[data-testid="hmi-diagram"] svg [fill]').forEach((el) => fills.add((el.getAttribute('fill') || '').toLowerCase()));
    return !fills.has('#dae8fc'); // pump base fill gone -> cell hidden
  }, 'Visibility=0 event hides a cell');
} catch (e) {
  check('phase3-check ran without throwing', false, e.message);
} finally {
  await b.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
