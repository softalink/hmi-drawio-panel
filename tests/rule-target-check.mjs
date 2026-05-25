// Verifies the collapsed rule-row "target" icon: click it, click a cell on the
// diagram, and the rule's mapping patterns retarget to that cell.
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DS = { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' };
const XML = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="pump" value="Pump" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;" vertex="1" parent="1"><mxGeometry x="20" y="20" width="320" height="180" as="geometry"/></mxCell></root></mxGraphModel>`;
const opts = () => ({ identifyBy: 'id', metadata: '', regex: true });
const rule = {
  id: 'r1', name: 'R', order: 1, hidden: false, metricPattern: '.*', column: '.*', aggregation: 'last',
  type: 'number', unit: 'short', decimals: 0, invert: false, gradient: false, iconState: false,
  thresholds: [{ color: '#73BF69', comparator: 'always', value: 0, level: 0, hidden: false }],
  tooltip: { enabled: false, label: '', colors: false, graph: false },
  mappings: {
    shapes: { options: opts(), list: [{ id: 's1', pattern: 'zzz', hidden: false, style: 'fillColor', applyOn: 'a' }] },
    texts: { options: opts(), list: [] }, links: { options: opts(), list: [] }, events: { options: opts(), list: [] },
  },
};
const dashboard = { title: 'rule-target', schemaVersion: 39, panels: [{ id: 1, type: 'softalink-hmidrawio-panel', title: 'rule-target', datasource: DS, gridPos: { h: 12, w: 16, x: 0, y: 0 }, targets: [{ refId: 'A', scenarioId: 'raw_frame', datasource: DS, rawFrameContent: '[{"columns":[{"text":"x","type":"number"}],"rows":[[1]]}]' }],
  options: { editorUrl: 'https://embed.diagrams.net/', editorTheme: 'kennedy', allowDrawioResources: false,
    flowcharts: [{ id: 'fc', name: 'Main', type: 'xml', download: false, url: '', xml: XML, scale: true, center: true, grid: false, bgColor: null, zoom: '100%', lock: true, animation: false, tooltip: true }], rules: [rule] } }] };

const results = [];
const check = (n, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${extra ? ` (${extra})` : ''}`); };

const b = await chromium.launch();
const ctx = await b.newContext({ storageState: 'playwright/.auth/admin.json', viewport: { width: 1500, height: 1100 } });
try {
  const res = await fetch(`${BASE}/api/dashboards/db`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify({ dashboard, overwrite: true }) });
  const uid = (await res.json()).uid;
  const p = await ctx.newPage();
  await p.goto(`${BASE}/d/${uid}?editPanel=1`, { waitUntil: 'networkidle', timeout: 45000 });
  await p.waitForSelector('[data-testid="hmi-diagram"] svg', { timeout: 30000 });
  await p.waitForTimeout(1500);

  // Collapsed row present with the target icon.
  check('Rule row has a target icon (collapsed)', (await p.getByRole('button', { name: /Target a cell on the diagram/i }).count()) >= 1);

  // Click target, then click the (single, large) cell in the preview.
  await p.getByRole('button', { name: /Target a cell on the diagram/i }).first().click();
  await p.waitForTimeout(300);
  const diag = await p.locator('[data-testid="hmi-diagram"]').first().boundingBox();
  await p.mouse.move(diag.x + diag.width / 2, diag.y + diag.height / 2);
  await p.waitForTimeout(150);
  await p.mouse.click(diag.x + diag.width / 2, diag.y + diag.height / 2);
  await p.waitForTimeout(500);

  // Expand the rule and confirm the shapes "What" was retargeted from zzz -> pump.
  await p.getByTestId('hmi-rule-expand').first().click();
  await p.waitForTimeout(500);
  check('Rule-row target retargets mappings to picked cell', (await p.getByText('pump', { exact: true }).count()) >= 1 && (await p.getByText('zzz', { exact: true }).count()) === 0);

  await p.close();
} catch (e) {
  check('rule-target-check ran without throwing', false, e.message);
} finally {
  await b.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
