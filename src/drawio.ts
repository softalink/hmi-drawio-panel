// Thin wrapper around the bundled draw.io static viewer (mxGraph + GraphViewer).
// The viewer attaches its classes (GraphViewer, mxUtils, mxConstants, Graph,
// mxUrlConverter, ...) to `window`, so everything here is intentionally
// untyped (`any`).
import { config, locationService } from '@grafana/runtime';

import {
  PLUGIN_ID,
  DRAWIO_PURIFY_PATH,
  DRAWIO_VIEWER_PATH,
  DEFAULT_EDITOR_URL,
  ANIM_COLOR_STEPS,
  ANIM_COLOR_MS,
} from './constants';
import { Flowchart } from './types';
import { isPicking } from './diagram-bus';

export interface RenderResult {
  graph: any;
  // Original draw.io style string per cell id. Rules reset to these before
  // re-applying, so a metric dropping below all thresholds restores the cell.
  baseStyles: Record<string, string>;
  // Original cell value (label) per cell id, so text mappings can be reset.
  baseValues: Record<string, any>;
  // Original geometry (x/y/width/height) per cell id, so size/width/height
  // events can be reset.
  baseGeometries: Record<string, { x: number; y: number; width: number; height: number }>;
}

// 1x1 grid tile draw.io uses for its background grid (from the original plugin).
const GRID_IMAGE =
  "url('data:image/gif;base64,R0lGODlhCgAKAJEAAAAAAP///8zMzP///yH5BAEAAAMALAAAAAAKAAoAAAIJ1I6py+0Po2wFADs=')";

let loaderPromise: Promise<void> | null = null;

function pluginBaseUrl(): string {
  const meta = (config as any)?.panels?.[PLUGIN_ID];
  return (meta && meta.baseUrl) || `public/plugins/${PLUGIN_ID}`;
}

function injectScript(src: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false; // preserve execution order across injected scripts
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

// DOMPurify ships as UMD. Grafana's plugin page exposes a global AMD `define`,
// so a plain <script> tag would register DOMPurify as an anonymous AMD module
// instead of setting `window.DOMPurify` — which the viewer needs as a global.
// Fetch the source and run it with CommonJS-style `module`/`exports` so the
// UMD wrapper takes the CJS branch, then publish the result on `window`.
async function loadDomPurifyGlobal(url: string): Promise<void> {
  const code = await fetch(url).then((r) => {
    if (!r.ok) {
      throw new Error(`Failed to fetch DOMPurify (${r.status})`);
    }
    return r.text();
  });
  const moduleObj: any = { exports: {} };
  // eslint-disable-next-line no-new-func
  const run = new Function('module', 'exports', code);
  run(moduleObj, moduleObj.exports);
  (window as any).DOMPurify = moduleObj.exports?.default || moduleObj.exports;
}

// Loads DOMPurify then the viewer, exactly once for the whole Grafana page.
export function loadDrawio(): Promise<void> {
  const w = window as any;
  if (w.GraphViewer && w.mxUtils) {
    return Promise.resolve();
  }
  if (loaderPromise) {
    return loaderPromise;
  }
  const base = pluginBaseUrl();
  loaderPromise = (async () => {
    if (!w.DOMPurify) {
      await loadDomPurifyGlobal(`${base}/${DRAWIO_PURIFY_PATH}`);
    }
    await injectScript(`${base}/${DRAWIO_VIEWER_PATH}`);
    if (!w.GraphViewer || !w.mxUtils) {
      loaderPromise = null;
      throw new Error('draw.io viewer loaded but globals are missing');
    }
  })();
  return loaderPromise;
}

// Allow / disallow the viewer loading images & resources from draw.io
// (mxUrlConverter base URL). Global to the page, like the original plugin.
export function setAllowDrawioResources(allow: boolean, editorUrl: string): void {
  const conv = (window as any).mxUrlConverter;
  if (!conv || !conv.prototype) {
    return;
  }
  if (allow) {
    conv.prototype.baseUrl = (editorUrl || DEFAULT_EDITOR_URL).replace(/\/$/, '') + '/';
    conv.prototype.baseDomain = '';
  } else {
    conv.prototype.baseUrl = null;
    conv.prototype.baseDomain = null;
  }
}

function applyContainerStyle(container: HTMLElement, fc: Flowchart): void {
  container.style.backgroundImage = fc.grid ? GRID_IMAGE : '';
  container.style.backgroundColor = fc.bgColor || '';
}

// Fits/zooms the graph to the flowchart's Scale/Center/Zoom options. Reused for
// the initial render and to reset the view (double-click on empty space).
export function fitToView(graph: any, fc: Flowchart): void {
  graph.centerZoom = false;
  try {
    if (fc.scale) {
      graph.maxFitScale = null;
      graph.fit(8);
      if (fc.center) {
        graph.center(true, true);
      }
    } else {
      graph.zoomActual();
      const pct = parseFloat((fc.zoom || '100%').replace('%', ''));
      if (isFinite(pct) && pct > 0 && pct !== 100) {
        graph.zoomTo(pct / 100, true);
      }
      if (fc.center) {
        graph.center(true, true);
      }
    }
  } catch (e) {
    // Fitting/centering can throw on empty/degenerate diagrams; the diagram
    // still renders at default scale.
  }
}

// Applies the Display/Others options to a freshly created graph.
function applyDisplay(graph: any, fc: Flowchart): void {
  graph.setEnabled(!fc.lock);
  try {
    graph.setTooltips(!!fc.tooltip);
  } catch (e) {
    // some builds gate tooltips behind a container; ignore if unavailable
  }
  fitToView(graph, fc);
}

// Renders a flowchart's diagram into `container` and returns the graph plus a
// snapshot of original styles. Handles raw <mxGraphModel>, <mxfile> and
// compressed diagrams (GraphViewer does the decoding).
export function renderDiagram(container: HTMLElement, fc: Flowchart, width: number, height: number): RenderResult {
  const w = window as any;
  container.innerHTML = '';
  container.style.width = `${Math.max(1, Math.floor(width))}px`;
  container.style.height = `${Math.max(1, Math.floor(height))}px`;
  container.style.overflow = 'hidden';
  applyContainerStyle(container, fc);

  const doc = w.mxUtils.parseXml(fc.xml);
  const graphConfig = {
    lightbox: false,
    nav: false,
    toolbar: null,
    'auto-fit': fc.scale,
    center: fc.center,
    resize: false,
    'allow-zoom-in': true,
    'allow-zoom-out': true,
    'check-visible-state': false,
  };

  const viewer = new w.GraphViewer(container, doc.documentElement, graphConfig);
  const graph = viewer.graph;
  applyDisplay(graph, fc);

  return {
    graph,
    baseStyles: captureBaseStyles(graph),
    baseValues: captureBaseValues(graph),
    baseGeometries: captureBaseGeometries(graph),
  };
}

function captureBaseGeometries(graph: any): Record<string, { x: number; y: number; width: number; height: number }> {
  const model = graph.getModel();
  const cells = model.cells || {};
  const out: Record<string, { x: number; y: number; width: number; height: number }> = {};
  Object.keys(cells).forEach((id) => {
    const g = cells[id].geometry;
    if (g) {
      out[id] = { x: g.x, y: g.y, width: g.width, height: g.height };
    }
  });
  return out;
}

function captureBaseStyles(graph: any): Record<string, string> {
  const model = graph.getModel();
  const cells = model.cells || {};
  const out: Record<string, string> = {};
  Object.keys(cells).forEach((id) => {
    out[id] = cells[id].style || '';
  });
  return out;
}

function captureBaseValues(graph: any): Record<string, any> {
  const model = graph.getModel();
  const cells = model.cells || {};
  const out: Record<string, any> = {};
  Object.keys(cells).forEach((id) => {
    out[id] = cells[id].value;
  });
  return out;
}

// Vertices and edges only (skips the root and layer cells).
export function getDrawableCells(graph: any): any[] {
  const model = graph.getModel();
  const cells = model.cells || {};
  return Object.keys(cells)
    .map((id) => cells[id])
    .filter((cell) => model.isVertex(cell) || model.isEdge(cell));
}

// Plain-text label for a cell (draw.io labels may be HTML or live on a wrapper
// object/UserObject element).
export function getCellLabel(graph: any, cell: any): string {
  let raw = '';
  const value = cell.value;
  if (value == null) {
    raw = '';
  } else if (typeof value === 'string') {
    raw = value;
  } else if (typeof value.getAttribute === 'function') {
    raw = value.getAttribute('label') || '';
  } else {
    try {
      raw = graph.convertValueToString(cell) || '';
    } catch (e) {
      raw = String(value);
    }
  }
  if (raw.indexOf('<') === -1) {
    return raw.trim();
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = raw;
  return (tmp.textContent || tmp.innerText || '').trim();
}

// Value of a draw.io metadata attribute on a cell (cells store metadata as
// attributes on a UserObject value element). Empty string when absent.
export function getCellMetadata(cell: any, key: string): string {
  const value = cell.value;
  if (value && typeof value.getAttribute === 'function') {
    return value.getAttribute(key) || '';
  }
  return '';
}

// All metadata attributes on a cell (excluding the reserved `label`).
export function getCellAllMetadata(cell: any): Record<string, string> {
  const out: Record<string, string> = {};
  const value = cell.value;
  if (value && value.attributes) {
    for (let i = 0; i < value.attributes.length; i++) {
      const a = value.attributes[i];
      if (a.name && a.name !== 'label') {
        out[a.name] = a.value;
      }
    }
  }
  return out;
}

// Halos a set of cells at once (one mxCellHighlight each) with a thick green
// outline offset from the cell by a gap. Returns a disposer.
export function highlightCells(graph: any, cells: any[]): () => void {
  const w = window as any;
  const highlights = cells.map((cell) => {
    const hl = new w.mxCellHighlight(graph, '#00FF00', 4); // pure green
    hl.spacing = 6; // gap between the halo and the cell
    hl.opacity = 100; // draw.io defaults highlights to 50% — make it solid
    hl.highlight(graph.view.getState(cell));
    return hl;
  });
  return () => {
    highlights.forEach((hl) => {
      hl.highlight(null);
      if (typeof hl.destroy === 'function') {
        hl.destroy();
      }
    });
  };
}

// Enters "pick" mode on a graph: cells halo on hover and a click reports the
// picked cell. Returns a cleanup function that tears it all down.
export function installPicker(graph: any, onPick: (cell: any) => void): () => void {
  const w = window as any;
  const container = graph.container;
  const prevCursor = container.style.cursor;
  const highlight = new w.mxCellHighlight(graph, '#1f78ff', 3);

  const cellAt = (evt: MouseEvent) => {
    const pt = w.mxUtils.convertPoint(container, evt.clientX, evt.clientY);
    return graph.getCellAt(pt.x, pt.y);
  };
  const onMove = (evt: MouseEvent) => {
    const cell = cellAt(evt);
    highlight.highlight(cell ? graph.view.getState(cell) : null);
  };
  const onClick = (evt: MouseEvent) => {
    const cell = cellAt(evt);
    if (cell) {
      evt.preventDefault();
      evt.stopPropagation();
      onPick(cell);
    }
  };
  container.style.cursor = 'crosshair';
  container.addEventListener('mousemove', onMove, true);
  container.addEventListener('click', onClick, true);

  return () => {
    container.removeEventListener('mousemove', onMove, true);
    container.removeEventListener('click', onClick, true);
    highlight.highlight(null);
    if (typeof highlight.destroy === 'function') {
      highlight.destroy();
    }
    container.style.cursor = prevCursor;
  };
}

// Left-drag pans the view by translating it directly (works regardless of Lock,
// unlike mxGraph's panning handler which is gated by graph.enabled). Uses pointer
// events + pointer capture so the drag keeps tracking even over child SVG nodes
// and outside the container, and suppresses the browser's native text-selection /
// element-drag that otherwise swallows the move events. A plain click (no movement
// past a small threshold) is left alone so links/picks still work, and panning is
// suppressed while a cell pick is in progress.
export function installPan(graph: any, container: HTMLElement): () => void {
  const THRESHOLD = 3;
  let active = false;
  let moved = false;
  let pointerId = -1;
  let startX = 0;
  let startY = 0;
  let baseTx = 0;
  let baseTy = 0;

  const onDown = (evt: PointerEvent) => {
    if (evt.button !== 0 || isPicking()) {
      return;
    }
    active = true;
    moved = false;
    pointerId = evt.pointerId;
    startX = evt.clientX;
    startY = evt.clientY;
    baseTx = graph.view.translate.x;
    baseTy = graph.view.translate.y;
  };
  const onMove = (evt: PointerEvent) => {
    if (!active || evt.pointerId !== pointerId) {
      return;
    }
    const dx = evt.clientX - startX;
    const dy = evt.clientY - startY;
    if (!moved && Math.abs(dx) + Math.abs(dy) < THRESHOLD) {
      return; // still a click, not a drag
    }
    if (!moved) {
      moved = true;
      container.style.cursor = 'grabbing';
      try {
        container.setPointerCapture(pointerId);
      } catch (e) {
        // capture unsupported; window-level tracking still works
      }
    }
    const scale = graph.view.scale || 1;
    graph.view.setTranslate(baseTx + dx / scale, baseTy + dy / scale);
    evt.preventDefault();
  };
  const onUp = () => {
    if (!active) {
      return;
    }
    active = false;
    if (moved) {
      container.style.cursor = 'grab';
      try {
        container.releasePointerCapture(pointerId);
      } catch (e) {
        // ignore
      }
    }
  };

  container.style.cursor = 'grab';
  container.style.touchAction = 'none';
  // Capture phase so we record the drag before draw.io's own handlers.
  container.addEventListener('pointerdown', onDown, true);
  container.addEventListener('pointermove', onMove, true);
  container.addEventListener('pointerup', onUp, true);
  container.addEventListener('pointercancel', onUp, true);
  return () => {
    container.removeEventListener('pointerdown', onDown, true);
    container.removeEventListener('pointermove', onMove, true);
    container.removeEventListener('pointerup', onUp, true);
    container.removeEventListener('pointercancel', onUp, true);
    container.style.touchAction = '';
  };
}

// Double-click empty space -> reset/refit; double-click a cell -> zoom so the
// cell fills the visible area, centered. Returns a cleanup. Uses graph.container
// (the viewer's own element) so getCellAt hit-testing matches the picker.
export function installDoubleClickZoom(graph: any, fc: Flowchart): () => void {
  const w = window as any;
  const container = graph.container;
  const onDblClick = (evt: MouseEvent) => {
    if (isPicking()) {
      return;
    }
    const pt = w.mxUtils.convertPoint(container, evt.clientX, evt.clientY);
    const cell = graph.getCellAt(pt.x, pt.y);
    const view = graph.view;
    const state = cell ? view.getState(cell) : null;

    if (!state || state.width <= 0 || state.height <= 0) {
      fitToView(graph, fc); // empty space (or degenerate cell) -> reset fit
      evt.preventDefault();
      return;
    }

    // Cell state geometry is in model coordinates (the viewer applies zoom via an
    // outer transform, not into the state), so use it directly.
    const mx = state.x;
    const my = state.y;
    const mw = state.width;
    const mh = state.height;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const margin = 1.15; // leave a little room around the cell
    let scale = Math.min(cw / (mw * margin), ch / (mh * margin));
    scale = Math.max(0.1, Math.min(scale, 8)); // clamp so tiny cells don't over-zoom

    // Translate so the cell center maps to the container center.
    const tx = cw / 2 / scale - (mx + mw / 2);
    const ty = ch / 2 / scale - (my + mh / 2);
    view.scaleAndTranslate(scale, tx, ty);
    evt.preventDefault();
  };

  // Capture phase so we run before draw.io's own dblclick handler consumes it.
  container.addEventListener('dblclick', onDblClick, true);
  return () => container.removeEventListener('dblclick', onDblClick, true);
}

// --- Cell coloring (with optional fade animation) --------------------------

// Pending animation timers, keyed by graph + cell + style target, so a new
// render/rule pass cancels the previous fade instead of fighting it.
const animTimers = new Map<string, number[]>();

function getStyleValue(style: string, key: string): string | undefined {
  for (const part of (style || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0 && part.substring(0, idx) === key) {
      return part.substring(idx + 1);
    }
  }
  return undefined;
}

function hexToRgb(hex: string): [number, number, number] | null {
  let h = (hex || '').trim();
  if (h[0] !== '#') {
    return null;
  }
  h = h.slice(1);
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length !== 6) {
    return null;
  }
  const n = parseInt(h, 16);
  if (isNaN(n)) {
    return null;
  }
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function setStyleOnCell(graph: any, cell: any, baseStyle: string, target: string, color: string): void {
  const w = window as any;
  const current = graph.getModel().getStyle(cell) || baseStyle;
  const next = w.mxUtils.setStyle(current, target, color);
  graph.getModel().setStyle(cell, next);
}

// Applies `color` to `cell` for the given style attribute. With `animate`, fades
// from the current color over a few steps; otherwise sets it immediately.
export function applyCellColor(
  graph: any,
  cell: any,
  baseStyle: string,
  target: string,
  color: string,
  animate: boolean,
  graphKey: string
): void {
  const key = `${graphKey}:${cell.id}:${target}`;
  const prev = animTimers.get(key);
  if (prev) {
    prev.forEach((t) => clearTimeout(t));
    animTimers.delete(key);
  }

  const current = graph.getModel().getStyle(cell) || baseStyle;
  const startHex = getStyleValue(current, target);
  const from = animate && startHex ? hexToRgb(startHex) : null;
  const to = hexToRgb(color);

  if (!from || !to) {
    setStyleOnCell(graph, cell, baseStyle, target, color);
    return;
  }

  const timers: number[] = [];
  for (let i = 1; i <= ANIM_COLOR_STEPS; i++) {
    const t = i / ANIM_COLOR_STEPS;
    const step = rgbToHex(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t);
    const id = window.setTimeout(() => {
      setStyleOnCell(graph, cell, baseStyle, target, step);
    }, ANIM_COLOR_MS * i);
    timers.push(id);
  }
  animTimers.set(key, timers);
}

export function resetCellStyle(graph: any, cell: any, baseStyle: string): void {
  graph.getModel().setStyle(cell, baseStyle);
}

// Restores a cell's original value (label), used before re-applying text rules.
export function resetCellValue(graph: any, cell: any, baseValue: any): void {
  graph.getModel().setValue(cell, baseValue === undefined ? null : baseValue);
}

// Sets a cell's plain-text label, preserving a UserObject wrapper if present.
export function setCellLabel(graph: any, cell: any, text: string): void {
  const model = graph.getModel();
  const val = cell.value;
  if (val && typeof val.setAttribute === 'function' && typeof val.cloneNode === 'function') {
    const clone = val.cloneNode(true);
    clone.setAttribute('label', text);
    model.setValue(cell, clone);
  } else {
    model.setValue(cell, text);
  }
}

// Adds/removes a clickable link on a cell by wrapping its rendered SVG node in
// an <a>. The static viewer only wires link click handlers once at construction,
// so rule-driven links must be wrapped directly. Call this AFTER the model batch
// has redrawn (the cell state's DOM node must exist).
const XLINK = 'http://www.w3.org/1999/xlink';
const SVGNS = 'http://www.w3.org/2000/svg';

// Navigate the SPA router to an in-app path, exactly like clicking a left-nav
// item. Normalize whatever the anchor reports (absolute or relative) to a
// root-relative path and strip the app sub-url so the router gets a clean path.
function navigateInternal(href: string): void {
  let path = href;
  try {
    // Synthetic base so relative hrefs parse; absolute hrefs ignore the base.
    const u = new URL(href, 'http://_/');
    path = u.pathname + u.search + u.hash;
  } catch (e) {
    // leave href as-is if it cannot be parsed
  }
  const sub = config.appSubUrl;
  if (sub && path.startsWith(sub)) {
    path = path.slice(sub.length) || '/';
  }
  locationService.push(path);
}

// Flag the anchor external vs internal: external opens a new tab via the browser;
// internal is handled by the click listener (set once when the <a> is created).
function setLinkKind(a: Element, internal: boolean): void {
  if (internal) {
    a.setAttribute('data-hmi-internal', '1');
    a.removeAttribute('target');
  } else {
    a.removeAttribute('data-hmi-internal');
    a.setAttribute('target', '_blank');
  }
}

export function setCellLink(graph: any, cell: any, url: string | null, internal = false): void {
  const state = graph.view.getState(cell);
  const node = state && state.shape && state.shape.node;
  if (!node || !node.parentNode) {
    return;
  }
  const parent = node.parentNode;
  const wrapped = parent.tagName && parent.tagName.toLowerCase() === 'a' && parent.getAttribute('data-hmi-link') != null;

  if (!url || !url.length) {
    if (wrapped) {
      parent.parentNode.insertBefore(node, parent);
      parent.parentNode.removeChild(parent);
    }
    return;
  }

  if (wrapped) {
    parent.setAttribute('href', url);
    parent.setAttributeNS(XLINK, 'xlink:href', url);
    setLinkKind(parent, internal);
    return;
  }
  const a = document.createElementNS(SVGNS, 'a');
  a.setAttribute('data-hmi-link', '1');
  a.setAttribute('href', url);
  a.setAttributeNS(XLINK, 'xlink:href', url);
  setLinkKind(a, internal);
  (a as any).style.cursor = 'pointer';
  // One listener handles both kinds by reading the current data attribute, so
  // re-applying rules only needs to flip the attribute (above) — not rebind.
  a.addEventListener('click', (ev) => {
    if (a.getAttribute('data-hmi-internal') === '1') {
      ev.preventDefault();
      ev.stopPropagation();
      navigateInternal(a.getAttribute('href') || '');
    }
  });
  parent.insertBefore(a, node);
  a.appendChild(node);
}

// --- Event / animation helpers ---------------------------------------------

// Sets a plain (non-color) mxGraph style key, e.g. rotation/opacity/shape.
export function setCellStyle(graph: any, cell: any, key: string, value: string): void {
  const w = window as any;
  const current = graph.getModel().getStyle(cell) || '';
  graph.getModel().setStyle(cell, w.mxUtils.setStyle(current, key, value));
}

export function setCellVisible(graph: any, cell: any, visible: boolean): void {
  graph.getModel().setVisible(cell, visible);
}

export function setCellCollapsed(graph: any, cell: any, collapsed: boolean): void {
  graph.getModel().setCollapsed(cell, collapsed);
}

// Resizes a cell, optionally scaling from its base geometry (for the 'size'
// percent event). `width`/`height` undefined keep the base dimension.
export function setCellSize(
  graph: any,
  cell: any,
  base: { x: number; y: number; width: number; height: number } | undefined,
  width?: number,
  height?: number
): void {
  const model = graph.getModel();
  const g = model.getGeometry(cell);
  if (!g || !base) {
    return;
  }
  const next = g.clone();
  next.width = width ?? base.width;
  next.height = height ?? base.height;
  model.setGeometry(cell, next);
}

export function resetCellGeometry(graph: any, cell: any, base: { x: number; y: number; width: number; height: number }): void {
  const model = graph.getModel();
  const g = model.getGeometry(cell);
  if (!g) {
    return;
  }
  if (g.width !== base.width || g.height !== base.height || g.x !== base.x || g.y !== base.y) {
    const next = g.clone();
    next.x = base.x;
    next.y = base.y;
    next.width = base.width;
    next.height = base.height;
    model.setGeometry(cell, next);
  }
}

// Sets a metadata attribute on a cell (used by tpText/tpMetadata events). draw.io
// stores metadata as attributes on a UserObject value element; wrap a plain
// string value if needed.
export function setCellMetadata(graph: any, cell: any, key: string, value: string | null): void {
  const w = window as any;
  const model = graph.getModel();
  let val = cell.value;
  if (!val || typeof val.setAttribute !== 'function') {
    const doc = w.mxUtils.createXmlDocument();
    const obj = doc.createElement('object');
    obj.setAttribute('label', typeof val === 'string' ? val : '');
    val = obj;
  } else {
    val = val.cloneNode(true);
  }
  if (value == null) {
    val.removeAttribute(key);
  } else {
    val.setAttribute(key, value);
  }
  model.setValue(cell, val);
}

// CSS keyframes for blink / edge-flow, injected once.
function ensureAnimCss(): void {
  if (document.getElementById('hmi-anim-css')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'hmi-anim-css';
  style.textContent =
    '@keyframes hmi-blink{0%,100%{opacity:1}50%{opacity:0}}' +
    '@keyframes hmi-flow{to{stroke-dashoffset:-16}}';
  document.head.appendChild(style);
}

export function getCellNode(graph: any, cell: any): any {
  const state = graph.view.getState(cell);
  return state && state.shape ? state.shape.node : null;
}

// Toggles a blink animation on a cell's rendered node.
export function setCellBlink(graph: any, cell: any, on: boolean, ms: number): void {
  const node = getCellNode(graph, cell);
  if (!node) {
    return;
  }
  if (on) {
    ensureAnimCss();
    node.style.animation = `hmi-blink ${ms > 0 ? ms : 500}ms steps(1) infinite`;
  } else {
    node.style.animation = '';
  }
}

// Toggles a flowing dashed animation on an edge's path.
export function setEdgeFlow(graph: any, cell: any, on: boolean, ms: number): void {
  const node = getCellNode(graph, cell);
  if (!node) {
    return;
  }
  const path = node.tagName && node.tagName.toLowerCase() === 'path' ? node : node.querySelector && node.querySelector('path');
  if (!path) {
    return;
  }
  if (on) {
    ensureAnimCss();
    path.style.strokeDasharray = '8 4';
    path.style.animation = `hmi-flow ${ms > 0 ? ms : 500}ms linear infinite`;
  } else {
    path.style.strokeDasharray = '';
    path.style.animation = '';
  }
}

// Ctrl/⌘/Alt + wheel zooms the diagram toward the cursor (matches the original;
// gated by the viewer's isZoomWheelEvent so a plain wheel still scrolls the
// dashboard). Returns a cleanup that removes the listener.
export function installWheelZoom(graph: any, container: HTMLElement): () => void {
  const onWheel = (evt: WheelEvent) => {
    if (typeof graph.isZoomWheelEvent !== 'function' || !graph.isZoomWheelEvent(evt)) {
      return; // plain wheel -> let the dashboard scroll
    }
    evt.preventDefault();
    const view = graph.view;
    // Zoom relative to the current scale, so this stays correct after a
    // double-click/pan has changed the view.
    const target = Math.max(0.1, Math.min(view.scale * (evt.deltaY < 0 ? 1.2 : 0.8), 8)); // clamp 10%..800%

    const rect = container.getBoundingClientRect();
    let dx = (evt.clientX - rect.left) * 2;
    let dy = (evt.clientY - rect.top) * 2;
    const scale = Math.round(target * 100) / 100;
    const factor = scale / view.scale;
    if (factor > 1) {
      const f = (factor - 1) / (scale * 2);
      dx *= -f;
      dy *= -f;
    } else {
      const f = (1 / factor - 1) / (view.scale * 2);
      dx *= f;
      dy *= f;
    }
    view.scaleAndTranslate(scale, view.translate.x + dx, view.translate.y + dy);
  };
  container.addEventListener('wheel', onWheel, { passive: false });
  return () => container.removeEventListener('wheel', onWheel);
}

// --- Edit diagram (online draw.io editor popup) ----------------------------

// Opens the diagram in the draw.io editor in a popup and resolves the edited
// XML via `onSave`. Uses the original plugin's simple postMessage protocol:
// `ready=fc-<id>` makes the editor announce itself, we reply with the XML, and
// the editor posts the edited XML back on save (empty string on plain exit).
export function openDrawioEditor(
  xml: string,
  editorUrl: string,
  theme: string,
  onSave: (xml: string) => void
): void {
  const id = `${Date.now()}`;
  const base = (editorUrl || DEFAULT_EDITOR_URL).replace(/\/$/, '');
  const url = `${base}/?embed=1&spin=1&libraries=1&ui=${theme}&ready=fc-${id}&src=grafana`;
  // noopener,noreferrer prevents tab-nabbing; with noopener the returned handle
  // is null by design, so we reply to the editor via event.source on the ready
  // message instead of a saved reference. Cannot distinguish "popup blocked"
  // from "opened successfully" — user must allow popups for this site.
  window.open(url, 'HMI draw.io Editor', 'noopener,noreferrer,width=1280,height=720');

  let posted = false;
  const cleanup = () => {
    window.removeEventListener('message', handler);
  };
  const handler = (event: MessageEvent) => {
    const data = event.data;
    if (typeof data !== 'string') {
      return;
    }
    if (data.substring(0, 3) === 'fc-') {
      if (data === `fc-${id}` && event.source) {
        const origin = event.origin && event.origin !== 'null' ? event.origin : '*';
        (event.source as WindowProxy).postMessage(xml, origin);
        posted = true;
      }
      return;
    }
    if (data.length > 0 && posted) {
      onSave(data);
      cleanup();
      return;
    }
    if (data.length === 0) {
      cleanup();
    }
  };
  window.addEventListener('message', handler);
}
