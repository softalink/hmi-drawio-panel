import { DataFrame, getFieldDisplayName, reduceField, ReducerID, FieldType, dateTimeFormat, getValueFormat } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';

import { Rule, Aggregation, Comparator, EventMethod, Flowchart, MapOptions, Threshold } from './types';
import {
  getDrawableCells,
  getCellLabel,
  getCellMetadata,
  applyCellColor,
  resetCellStyle,
  resetCellValue,
  resetCellGeometry,
  setCellLabel,
  setCellLink,
  setCellStyle,
  setCellVisible,
  setCellCollapsed,
  setCellSize,
  setCellMetadata,
  setCellBlink,
  setEdgeFlow,
  getCellNode,
} from './drawio';
import { attachCellTooltip, clearCellTooltip, setNodeTitle, removeNodeTitle, sparkline, escapeHtml } from './tooltip';

// One rendered flowchart: its graph, the captured base styles/values, options.
export interface RenderEntry {
  graph: any;
  baseStyles: Record<string, string>;
  baseValues: Record<string, any>;
  baseGeometries: Record<string, { x: number; y: number; width: number; height: number }>;
  fc: Flowchart;
}

// The evaluated state of a rule against the current data.
export interface RuleResult {
  rule: Rule;
  value: number | string | undefined;
  formatted: string;
  level: number | undefined;
  color: string | undefined;
  defined: boolean;
  values: number[]; // numeric series (for tooltip sparklines)
}

const aggToReducer: Record<Aggregation, ReducerID> = {
  first: ReducerID.first,
  first_notnull: ReducerID.firstNotNull,
  last: ReducerID.last,
  last_notnull: ReducerID.lastNotNull,
  min: ReducerID.min,
  max: ReducerID.max,
  sum: ReducerID.sum,
  mean: ReducerID.mean,
  count: ReducerID.count,
  delta: ReducerID.delta,
  range: ReducerID.range,
  diff: ReducerID.diff,
  last_time: ReducerID.last, // handled specially in computeValue (time field)
};

// Gates whether a color/text/link mapping applies for the current rule level.
function mappingActive(applyOn: string, level: number | undefined, maxLevel: number): boolean {
  switch (applyOn) {
    case 'n':
      return false;
    case 'wc':
      return level !== undefined && level >= 1;
    case 'co':
      return level !== undefined && maxLevel >= 1 && level >= maxLevel;
    case 'a':
    case 'wmd':
    default:
      return true;
  }
}

function ruleMaxLevel(rule: Rule): number {
  const levels = rule.thresholds.filter((t) => !t.hidden).map((t) => t.level);
  return levels.length ? Math.max(...levels) : 0;
}

// --- pattern / regex matching -----------------------------------------------

function stripSlashes(p: string): string {
  const m = /^\/(.*)\/([a-z]*)$/.exec(p);
  return m ? m[1] : p;
}

export function matchRegex(text: string, pattern: string): boolean {
  try {
    return new RegExp(stripSlashes(pattern)).test(text);
  } catch (e) {
    return false;
  }
}

// Matches a cell identifier against a mapping pattern, honoring the group's
// regex option (literal equality otherwise; empty pattern matches all).
export function matchPattern(text: string, pattern: string, regex: boolean): boolean {
  if (pattern === '') {
    return true;
  }
  return regex ? matchRegex(text, pattern) : text === pattern;
}

// The identifier used to match a cell, per the mapping group's options.
export function cellIdentifier(graph: any, cell: any, options: MapOptions): string {
  switch (options.identifyBy) {
    case 'label':
      return getCellLabel(graph, cell);
    case 'metadata':
      return getCellMetadata(cell, options.metadata);
    case 'id':
    default:
      return String(cell.id);
  }
}

// --- value / format ---------------------------------------------------------

// Finds the first field whose frame name matches `metricPattern` and whose
// display name matches `column`.
function findField(series: DataFrame[], rule: Rule): { field: any; frame: any } | undefined {
  for (const frame of series) {
    const frameName = frame.name || frame.refId || '';
    if (!matchRegex(frameName, rule.metricPattern)) {
      continue;
    }
    for (const field of frame.fields) {
      if (rule.type === 'number' && field.type !== FieldType.number) {
        continue;
      }
      const dn = getFieldDisplayName(field, frame, series);
      if (matchRegex(dn, rule.column)) {
        return { field, frame };
      }
    }
  }
  return undefined;
}

export function computeValue(series: DataFrame[], rule: Rule): number | string | undefined {
  const f = findField(series, rule);
  if (!f) {
    return undefined;
  }
  if (rule.type === 'string') {
    const vals = f.field.values?.toArray ? f.field.values.toArray() : f.field.values ?? [];
    const v = vals.length ? vals[vals.length - 1] : undefined;
    return v == null ? undefined : String(v);
  }
  if (rule.aggregation === 'last_time') {
    const timeField = f.frame.fields.find((fl: any) => fl.type === FieldType.time);
    const arr = timeField ? (timeField.values?.toArray ? timeField.values.toArray() : timeField.values ?? []) : [];
    return arr.length ? Number(arr[arr.length - 1]) : undefined;
  }
  const reducer = aggToReducer[rule.aggregation] ?? ReducerID.last;
  const result = reduceField({ field: f.field, reducers: [reducer] });
  const n = result[reducer];
  return typeof n === 'number' && !isNaN(n) ? n : undefined;
}

export function formatValue(rule: Rule, value: number | string | undefined): string {
  if (value === undefined) {
    return '';
  }
  if (rule.type === 'number') {
    const fmt = getValueFormat(rule.unit || 'short')(value as number, rule.decimals);
    return `${fmt.prefix ?? ''}${fmt.text}${fmt.suffix ?? ''}`;
  }
  if (rule.type === 'date') {
    return dateTimeFormat(value as number);
  }
  return String(value);
}

// --- thresholds -------------------------------------------------------------

function compare(comparator: Comparator, type: Rule['type'], value: number | string, target: number | string): boolean {
  if (comparator === 'always') {
    return true;
  }
  if (type === 'string') {
    const m = matchRegex(String(value), String(target));
    if (comparator === 'eq') {
      return m;
    }
    if (comparator === 'ne') {
      return !m;
    }
    return false;
  }
  const v = Number(value);
  const t = Number(target);
  switch (comparator) {
    case 'ge':
      return v >= t;
    case 'gt':
      return v > t;
    case 'le':
      return v <= t;
    case 'lt':
      return v < t;
    case 'eq':
      return v === t;
    case 'ne':
      return v !== t;
    default:
      return false;
  }
}

function hexToRgb(hex: string): [number, number, number] | null {
  let h = (hex || '').trim();
  if (h[0] !== '#') {
    return null;
  }
  h = h.slice(1);
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  if (h.length !== 6) {
    return null;
  }
  const n = parseInt(h, 16);
  return isNaN(n) ? null : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpColor(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  if (!a || !b) {
    return to;
  }
  const c = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t).toString(16).padStart(2, '0');
  return `#${c(0)}${c(1)}${c(2)}`;
}

// Evaluates the rule's thresholds for `value`, returning the matched level and
// color. The base threshold (comparator 'always') is the fallback; the highest
// matching non-base threshold wins (lowest, if inverted). Gradient interpolates
// toward the next threshold.
export function evaluate(rule: Rule, value: number | string | undefined): { defined: boolean; level?: number; color?: string } {
  if (value === undefined) {
    return { defined: false };
  }
  const visible = rule.thresholds.filter((t) => !t.hidden);
  const base = visible.find((t) => t.comparator === 'always');
  const nonBase = visible.filter((t) => t.comparator !== 'always');
  const sorted = [...nonBase].sort((a, b) => Number(a.value) - Number(b.value));
  const ordered = rule.invert ? sorted.reverse() : sorted;

  let chosen: Threshold | undefined = base;
  let chosenIdx = -1;
  ordered.forEach((t, i) => {
    if (compare(t.comparator, rule.type, value, t.value)) {
      chosen = t;
      chosenIdx = i;
    }
  });

  if (!chosen) {
    return { defined: false };
  }

  let color = chosen.color;
  if (rule.gradient && rule.type === 'number' && chosenIdx >= 0 && chosenIdx < ordered.length - 1) {
    const next = ordered[chosenIdx + 1];
    const lo = Number(chosen.value);
    const hi = Number(next.value);
    if (hi !== lo) {
      const t = Math.max(0, Math.min(1, (Number(value) - lo) / (hi - lo)));
      color = lerpColor(chosen.color, next.color, t);
    }
  }
  return { defined: true, level: chosen.level, color };
}

function fieldValues(series: DataFrame[], rule: Rule): number[] {
  const f = findField(series, rule);
  if (!f || rule.type !== 'number') {
    return [];
  }
  const arr = f.field.values?.toArray ? f.field.values.toArray() : f.field.values ?? [];
  return arr.filter((v: any) => typeof v === 'number' && !isNaN(v));
}

export function computeRuleResult(series: DataFrame[], rule: Rule): RuleResult {
  const value = computeValue(series, rule);
  const ev = evaluate(rule, value);
  return {
    rule,
    value,
    formatted: formatValue(rule, value),
    level: ev.level,
    color: ev.color,
    defined: ev.defined,
    values: fieldValues(series, rule),
  };
}

// --- application ------------------------------------------------------------

function applyShapes(graph: any, baseStyles: Record<string, string>, fc: Flowchart, res: RuleResult, cells: any[]): void {
  if (!res.defined || !res.color) {
    return;
  }
  const grp = res.rule.mappings.shapes;
  const maxLevel = ruleMaxLevel(res.rule);
  for (const m of grp.list) {
    if (m.hidden || !mappingActive(m.applyOn, res.level, maxLevel)) {
      continue;
    }
    for (const cell of cells) {
      if (matchPattern(cellIdentifier(graph, cell, grp.options), m.pattern, grp.options.regex)) {
        applyCellColor(graph, cell, baseStyles[cell.id] || '', m.style, res.color, fc.animation, fc.id);
      }
    }
  }
}

// Replaces matched cells' labels with the rule's formatted value.
function applyTexts(graph: any, res: RuleResult, cells: any[]): void {
  if (!res.defined) {
    return;
  }
  const grp = res.rule.mappings.texts;
  const maxLevel = ruleMaxLevel(res.rule);
  for (const m of grp.list) {
    if (m.hidden || !mappingActive(m.applyOn, res.level, maxLevel)) {
      continue;
    }
    for (const cell of cells) {
      if (!matchPattern(cellIdentifier(graph, cell, grp.options), m.pattern, grp.options.regex)) {
        continue;
      }
      const current = getCellLabel(graph, cell);
      let next: string;
      switch (m.textReplace) {
        case 'pattern':
          try {
            next = current.replace(new RegExp(stripSlashes(m.textPattern)), res.formatted);
          } catch (e) {
            next = current;
          }
          break;
        case 'as':
          next = `${current} ${res.formatted}`;
          break;
        case 'anl':
          next = `${current}\n${res.formatted}`;
          break;
        case 'content':
        default:
          next = res.formatted;
      }
      setCellLabel(graph, cell, next);
    }
  }
}

// Adds clickable links to matched cells (with dashboard-variable substitution).
function applyLinks(graph: any, res: RuleResult, cells: any[]): void {
  if (!res.defined) {
    return;
  }
  const grp = res.rule.mappings.links;
  const maxLevel = ruleMaxLevel(res.rule);
  for (const m of grp.list) {
    if (m.hidden || !m.url || !mappingActive(m.applyOn, res.level, maxLevel)) {
      continue;
    }
    for (const cell of cells) {
      if (!matchPattern(cellIdentifier(graph, cell, grp.options), m.pattern, grp.options.regex)) {
        continue;
      }
      let url = m.url;
      try {
        url = getTemplateSrv().replace(url);
      } catch (e) {
        // template service unavailable (e.g. tests); use the raw url
      }
      if (m.params) {
        const sp = new URLSearchParams(window.location.search);
        const from = sp.get('from');
        const to = sp.get('to');
        if (from || to) {
          url += `${url.includes('?') ? '&' : '?'}from=${from ?? ''}&to=${to ?? ''}`;
        }
      }
      setCellLink(graph, cell, url, (m.linkType ?? 'external') === 'internal');
    }
  }
}

// Event methods that map directly to an mxGraph style key (reset by style reset).
const STYLE_EVENTS: Partial<Record<EventMethod, string>> = {
  rotation: 'rotation',
  opacity: 'opacity',
  flipH: 'flipH',
  flipV: 'flipV',
  gradientDirection: 'gradientDirection',
  startArrow: 'startArrow',
  endArrow: 'endArrow',
  shape: 'shape',
  image: 'image',
  fontSize: 'fontSize',
  textOpacity: 'textOpacity',
};

// An event fires when the rule's level satisfies the mapping's comparator/level.
function eventFires(res: RuleResult, ev: { comparator: Comparator; level: number }): boolean {
  if (res.level === undefined) {
    return false;
  }
  return compare(ev.comparator, 'number', res.level, ev.level);
}

// Model-pass events (style / geometry / visibility / metadata / label).
function applyEventsModel(
  graph: any,
  res: RuleResult,
  cells: any[],
  baseGeometries: Record<string, { x: number; y: number; width: number; height: number }>
): void {
  if (!res.defined) {
    return;
  }
  const grp = res.rule.mappings.events;
  for (const m of grp.list) {
    if (m.hidden) {
      continue;
    }
    for (const cell of cells) {
      if (!matchPattern(cellIdentifier(graph, cell, grp.options), m.pattern, grp.options.regex) || !eventFires(res, m)) {
        continue;
      }
      const styleKey = STYLE_EVENTS[m.method];
      if (styleKey) {
        setCellStyle(graph, cell, styleKey, m.value);
        continue;
      }
      const base = baseGeometries[cell.id];
      switch (m.method) {
        case 'text':
          setCellLabel(graph, cell, m.value);
          break;
        case 'visibility':
          setCellVisible(graph, cell, String(m.value) === '1');
          break;
        case 'fold':
          setCellCollapsed(graph, cell, String(m.value) === '0');
          break;
        case 'height':
          setCellSize(graph, cell, base, undefined, Number(m.value));
          break;
        case 'width':
          setCellSize(graph, cell, base, Number(m.value), undefined);
          break;
        case 'size':
          if (base) {
            const pct = Number(m.value) / 100;
            setCellSize(graph, cell, base, base.width * pct, base.height * pct);
          }
          break;
        case 'tpText':
          setCellMetadata(graph, cell, 'tooltip', m.value);
          break;
        case 'tpMetadata': {
          const parts = String(m.value).split('@');
          const key = parts.shift() || '';
          if (key) {
            setCellMetadata(graph, cell, key, parts.length ? parts.join('@') : null);
          }
          break;
        }
        // blink / class_mxEdgeFlow handled in the DOM pass.
        // barPos / gaugePos require draw.io bar/gauge shape internals not present
        // in the offline static viewer — intentionally skipped.
        default:
          break;
      }
    }
  }
}

// DOM-pass events (CSS animations applied after the cell node is rendered).
function applyEventsDom(graph: any, res: RuleResult, cells: any[]): void {
  if (!res.defined) {
    return;
  }
  const grp = res.rule.mappings.events;
  for (const m of grp.list) {
    if (m.hidden || (m.method !== 'blink' && m.method !== 'class_mxEdgeFlow')) {
      continue;
    }
    for (const cell of cells) {
      if (!matchPattern(cellIdentifier(graph, cell, grp.options), m.pattern, grp.options.regex) || !eventFires(res, m)) {
        continue;
      }
      const ms = Number(m.value) || 500;
      if (m.method === 'blink') {
        setCellBlink(graph, cell, true, ms);
      } else {
        setEdgeFlow(graph, cell, true, ms);
      }
    }
  }
}

// Hover tooltips ("Display metrics") on the cells matched by the rule's
// Color/Tooltip (shapes) mappings.
function applyTooltips(graph: any, res: RuleResult, cells: any[]): void {
  const tp = res.rule.tooltip;
  if (!tp.enabled || !res.defined) {
    return;
  }
  const grp = res.rule.mappings.shapes;
  const label = tp.label || res.rule.name;
  const valueColor = tp.colors && res.color ? res.color : 'inherit';
  const graphHtml = tp.graph ? sparkline(res.values, res.color || '#8e8e8e') : '';
  const html = `<div style="font-weight:600;margin-bottom:2px">${escapeHtml(label)}</div><div style="color:${valueColor}">${escapeHtml(res.formatted)}</div>${graphHtml}`;
  const title = `${label}: ${res.formatted}`;

  for (const m of grp.list) {
    if (m.hidden) {
      continue;
    }
    for (const cell of cells) {
      if (!matchPattern(cellIdentifier(graph, cell, grp.options), m.pattern, grp.options.regex)) {
        continue;
      }
      const node = getCellNode(graph, cell);
      if (node) {
        setNodeTitle(node, title);
        attachCellTooltip(node, html);
      }
    }
  }
}

// Resets every cell of every flowchart to its base style, then applies all
// (non-hidden) rules across all flowcharts. A rule's value is computed once.
export function applyRules(entries: RenderEntry[], rules: Rule[], series: DataFrame[]): void {
  const results = rules.filter((r) => !r.hidden).map((rule) => computeRuleResult(series, rule));

  // Which event kinds are in use — only reset what events can change, so plain
  // color rules never disturb base visibility/fold/geometry.
  const evMethods = results.flatMap((r) => r.rule.mappings.events.list.filter((e) => !e.hidden).map((e) => e.method));
  const hasVis = evMethods.includes('visibility');
  const hasFold = evMethods.includes('fold');
  const hasGeom = evMethods.some((m) => m === 'size' || m === 'width' || m === 'height');
  const hasDomEv = evMethods.some((m) => m === 'blink' || m === 'class_mxEdgeFlow');
  const hasTooltips = results.some((r) => r.rule.tooltip.enabled);

  for (const { graph, baseStyles, baseValues, baseGeometries, fc } of entries) {
    const model = graph.getModel();
    const cells = getDrawableCells(graph);
    model.beginUpdate();
    try {
      cells.forEach((cell) => {
        const base = baseStyles[cell.id];
        if (base != null) {
          resetCellStyle(graph, cell, base);
        }
        if (cell.id in baseValues) {
          resetCellValue(graph, cell, baseValues[cell.id]); // restores label + author links
        }
        if (hasVis) {
          setCellVisible(graph, cell, true);
        }
        if (hasFold) {
          setCellCollapsed(graph, cell, false);
        }
        if (hasGeom && baseGeometries[cell.id]) {
          resetCellGeometry(graph, cell, baseGeometries[cell.id]);
        }
      });
      for (const res of results) {
        applyShapes(graph, baseStyles, fc, res, cells);
        applyTexts(graph, res, cells);
        applyEventsModel(graph, res, cells, baseGeometries);
      }
    } finally {
      model.endUpdate();
    }

    // Post-render DOM pass (cell nodes exist after endUpdate): clear stale link
    // wrappers / animations, then apply links and CSS-animation events.
    cells.forEach((cell) => {
      setCellLink(graph, cell, null);
      if (hasDomEv) {
        setCellBlink(graph, cell, false, 0);
        setEdgeFlow(graph, cell, false, 0);
      }
      if (hasTooltips) {
        const node = getCellNode(graph, cell);
        if (node) {
          clearCellTooltip(node);
          removeNodeTitle(node);
        }
      }
    });
    for (const res of results) {
      applyLinks(graph, res, cells);
      applyEventsDom(graph, res, cells);
      applyTooltips(graph, res, cells);
    }
  }
}
