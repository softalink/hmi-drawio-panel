// Render-level verification of the new options via dashboards created through
// the Grafana HTTP API (admin basic auth), then loaded headlessly:
//   1. Multi-flowchart  -> two stacked diagrams render
//   2. Grid + Bg Color  -> the layer container gets the grid image + bg color
//   3. Legacy migration -> an old {xml, fit, rules} panel auto-upgrades & colors
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DS = { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' };

const XML = `<mxGraphModel dx="640" dy="480" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="pump" value="Pump" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1"><mxGeometry x="40" y="120" width="120" height="60" as="geometry"/></mxCell><mxCell id="tank" value="Tank" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1"><mxGeometry x="260" y="100" width="100" height="100" as="geometry"/></mxCell><mxCell id="valve" value="Valve" style="rhombus;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;" vertex="1" parent="1"><mxGeometry x="460" y="120" width="90" height="60" as="geometry"/></mxCell></root></mxGraphModel>`;

const RULES = ['pump', 'tank', 'valve'].map((n) => ({
  id: `r-${n}`,
  name: n,
  metric: `^${n}$`,
  reducer: 'last',
  matchType: 'id',
  pattern: `^${n}$`,
  style: 'fillColor',
  thresholds: [
    { value: 0, color: '#73BF69' },
    { value: 80, color: '#FF9830' },
    { value: 90, color: '#F2495C' },
  ],
}));

const TARGET = {
  refId: 'A',
  scenarioId: 'raw_frame',
  datasource: DS,
  rawFrameContent: '[{"columns":[{"text":"pump","type":"number"},{"text":"tank","type":"number"},{"text":"valve","type":"number"}],"rows":[[85,50,95]]}]',
};

function fc(over = {}) {
  return {
    id: `fc-${Math.random().toString(36).slice(2)}`,
    name: 'Main',
    type: 'xml',
    download: false,
    url: '',
    xml: XML,
    scale: true,
    center: true,
    grid: false,
    bgColor: null,
    zoom: '100%',
    lock: true,
    animation: false,
    tooltip: true,
    ...over,
  };
}

async function createDashboard(title, options) {
  const dashboard = {
    title,
    uid: null,
    schemaVersion: 39,
    panels: [
      {
        id: 1,
        type: 'softalink-hmidrawio-panel',
        title,
        datasource: DS,
        gridPos: { h: 12, w: 18, x: 0, y: 0 },
        targets: [TARGET],
        options,
      },
    ],
    time: { from: 'now-6h', to: 'now' },
  };
  const res = await fetch(`${BASE}/api/dashboards/db`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: JSON.stringify({ dashboard, overwrite: true }),
  });
  if (!res.ok) {
    throw new Error(`create "${title}" failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()).uid;
}

const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${extra ? ` (${extra})` : ''}`);
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });

async function load(page, uid) {
  await page.goto(`${BASE}/d/${uid}?kiosk`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('[data-testid="hmi-diagram"] svg', { timeout: 30000 });
  await page.waitForTimeout(800);
}

try {
  // 1. Multi-flowchart (with rules: each color should land on BOTH layers)
  const uidMulti = await createDashboard('feat-multi', {
    editorUrl: 'https://embed.diagrams.net/',
    editorTheme: 'kennedy',
    allowDrawioResources: false,
    flowcharts: [fc({ name: 'Base', animation: false }), fc({ name: 'Overlay', animation: false })],
    rules: RULES,
  });
  let page = await ctx.newPage();
  await load(page, uidMulti);
  const svgCount = await page.locator('[data-testid="hmi-diagram"] svg').count();
  const layerCount = await page.locator('[data-testid="hmi-diagram"] > div').count();
  check('Two flowcharts render as two stacked layers', svgCount >= 2 && layerCount >= 2, `svgs=${svgCount} layers=${layerCount}`);
  // Wait for the threshold colors, then confirm each appears twice (once per layer).
  const counts = await page
    .waitForFunction(
      () => {
        const want = ['#ff9830', '#73bf69', '#f2495c'];
        const tally = Object.fromEntries(want.map((c) => [c, 0]));
        document.querySelectorAll('[data-testid="hmi-diagram"] svg [fill]').forEach((el) => {
          const f = (el.getAttribute('fill') || '').toLowerCase();
          if (f in tally) {
            tally[f]++;
          }
        });
        return want.every((c) => tally[c] >= 2) ? tally : false;
      },
      null,
      { timeout: 15000, polling: 300 }
    )
    .then((h) => h.jsonValue())
    .catch(() => null);
  check('Rules color cells on both stacked layers', !!counts, counts ? JSON.stringify(counts) : 'colors not doubled');
  await page.close();

  // 2. Grid + Bg Color
  const uidGrid = await createDashboard('feat-grid', {
    editorUrl: 'https://embed.diagrams.net/',
    editorTheme: 'kennedy',
    allowDrawioResources: false,
    flowcharts: [fc({ grid: true, bgColor: '#112233' })],
    rules: [],
  });
  page = await ctx.newPage();
  await load(page, uidGrid);
  const style = await page.locator('[data-testid="hmi-diagram"] > div').first().evaluate((el) => ({
    bgImage: el.style.backgroundImage,
    bgColor: el.style.backgroundColor,
  }));
  check('Grid sets the container background image', style.bgImage.includes('url('), style.bgImage.slice(0, 24));
  check('Bg Color sets the container background color', style.bgColor === 'rgb(17, 34, 51)', style.bgColor);
  await page.close();

  // 3. Legacy migration: old { xml, fit, rules } with no flowcharts array
  const uidLegacy = await createDashboard('feat-legacy', {
    xml: XML,
    fit: true,
    rules: RULES,
  });
  page = await ctx.newPage();
  await load(page, uidLegacy);
  const fills = await page.evaluate(() => {
    const set = new Set();
    document.querySelectorAll('[data-testid="hmi-diagram"] svg [fill]').forEach((el) => set.add((el.getAttribute('fill') || '').toLowerCase()));
    return [...set];
  });
  const want = ['#ff9830', '#73bf69', '#f2495c'];
  const got = want.filter((c) => fills.includes(c));
  check('Legacy {xml,fit,rules} panel migrates and renders', (await page.locator('[data-testid="hmi-diagram"] svg').count()) >= 1);
  check('Migrated panel applies threshold colors', got.length === 3, `matched ${got.join(',')}`);
  await page.close();
} catch (e) {
  check('features-check ran without throwing', false, e.message);
} finally {
  await b.close();
}

process.exit(results.every(Boolean) ? 0 : 1);
