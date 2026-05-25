// Editor-level checks for the new items (2,3,4,5,6,7) + the diagram picker.
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const DS = { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' };
const PROVISIONED = 'a538aeff-5a8a-42a5-901c-938d896fdd6f';

const results = [];
const check = (n, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${extra ? ` (${extra})` : ''}`); };

const b = await chromium.launch();
const ctx = await b.newContext({ storageState: 'playwright/.auth/admin.json', viewport: { width: 1600, height: 1100 } });

// --- Part 1: provisioned dashboard, presence of new editor controls --------
try {
  const p = await ctx.newPage();
  await p.goto(`http://localhost:3000/d/${PROVISIONED}?editPanel=1`, { waitUntil: 'networkidle', timeout: 45000 });
  await p.waitForTimeout(2500);

  const refreshBefore = await p.getByRole('button', { name: 'Refresh' }).count();
  await p.getByTestId('hmi-rule-expand').first().click();
  await p.waitForTimeout(700);
  const detail = p.getByTestId('hmi-rule-detail').first();

  // Items 2 & 3: a Refresh button on the table and on each mapping (4 groups).
  const refreshAfter = await p.getByRole('button', { name: 'Refresh' }).count();
  check('Refresh buttons added (table + 4 mappings)', refreshAfter - refreshBefore >= 4, `refresh ${refreshBefore} -> ${refreshAfter}`);

  // Item 4: metric/column/aggregation are comboboxes; aggregation has new entries.
  const combos = detail.getByRole('combobox');
  check('Options use comboboxes (metrics/column/aggregation)', (await combos.count()) >= 3, `combos ${await combos.count()}`);
  await combos.nth(2).click(); // aggregation
  await p.waitForTimeout(300);
  let aggOk = true;
  for (const t of ['First (not null)', 'Last (not null)', 'Diff', 'Time of last point']) {
    if ((await p.getByText(t, { exact: false }).count()) < 1) { aggOk = false; }
  }
  check('Aggregation dropdown has the new entries', aggOk);
  await p.keyboard.press('Escape');

  // Item 5: eye (hide/disable) and per-row "+" add-below.
  check('Threshold rows have a hide/disable eye', (await p.getByRole('button', { name: /Hide.*Disable this color/i }).count()) >= 1);
  check('Threshold rows have add-below "+"', (await p.getByRole('button', { name: 'Add a threshold below' }).count()) >= 1);

  // Item 6: "What" combobox + bull's-eye picker button.
  check('Mappings have a bull’s-eye pick button', (await p.getByRole('button', { name: 'Pick a cell on the diagram' }).count()) >= 1);

  // Item 7: the "What" cell (first column of a mapping row) grows to fill width.
  // The pick button now lives in the Actions column, so anchor on its row and
  // measure the row's first grid child (the What cell).
  const firstPick = p.getByRole('button', { name: 'Pick a cell on the diagram' }).first();
  const mapRow = firstPick.locator('xpath=ancestor::*[contains(@style,"grid-template-columns")][1]');
  const box = await mapRow.locator('xpath=./*[1]').boundingBox();
  check('Row controls grow to fill width', !!box && box.width > 150, box ? `what cell width ${Math.round(box.width)}px` : 'no box');

  // Item 5: "Base" appears for a rule that has a base threshold (a fresh rule).
  await p.getByRole('button', { name: 'Add a rule' }).click();
  await p.waitForTimeout(600);
  check('Threshold table shows "Base"', (await p.getByText('Base', { exact: true }).count()) >= 1);

  await p.close();
} catch (e) {
  check('items-editor part1 ran without throwing', false, e.message);
}

// --- Part 2: single big cell, exercise the diagram picker -------------------
try {
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
  const dashboard = { title: 'item-picker', schemaVersion: 39, panels: [{ id: 1, type: 'softalink-hmidrawio-panel', title: 'item-picker', datasource: DS, gridPos: { h: 12, w: 16, x: 0, y: 0 }, targets: [{ refId: 'A', scenarioId: 'raw_frame', datasource: DS, rawFrameContent: '[{"columns":[{"text":"x","type":"number"}],"rows":[[1]]}]' }],
    options: { editorUrl: 'https://embed.diagrams.net/', editorTheme: 'kennedy', allowDrawioResources: false,
      flowcharts: [{ id: 'fc', name: 'Main', type: 'xml', download: false, url: '', xml: XML, scale: true, center: true, grid: false, bgColor: null, zoom: '100%', lock: true, animation: false, tooltip: true }], rules: [rule] } }] };
  const res = await fetch(`${BASE}/api/dashboards/db`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify({ dashboard, overwrite: true }) });
  const uid = (await res.json()).uid;

  const p = await ctx.newPage();
  await p.goto(`http://localhost:3000/d/${uid}?editPanel=1`, { waitUntil: 'networkidle', timeout: 45000 });
  await p.waitForSelector('[data-testid="hmi-diagram"] svg', { timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.getByTestId('hmi-rule-expand').first().click();
  await p.waitForTimeout(600);

  // Before: the What combobox shows the placeholder pattern "zzz".
  check('Picker: What starts as "zzz"', (await p.getByText('zzz', { exact: true }).count()) >= 1);

  // Activate pick, then click the (single, large) cell in the preview.
  await p.getByRole('button', { name: 'Pick a cell on the diagram' }).first().click();
  await p.waitForTimeout(300);
  const diag = await p.locator('[data-testid="hmi-diagram"]').first().boundingBox();
  await p.mouse.move(diag.x + diag.width / 2, diag.y + diag.height / 2);
  await p.waitForTimeout(150);
  await p.mouse.click(diag.x + diag.width / 2, diag.y + diag.height / 2);
  await p.waitForTimeout(500);

  check('Picker fills "What" with the clicked cell id (pump)', (await p.getByText('pump', { exact: true }).count()) >= 1 && (await p.getByText('zzz', { exact: true }).count()) === 0);

  await p.close();
} catch (e) {
  check('items-editor part2 (picker) ran without throwing', false, e.message);
}

await b.close();
process.exit(results.every(Boolean) ? 0 : 1);
