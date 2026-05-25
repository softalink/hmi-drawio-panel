// Custom hover tooltip for rule "Display metrics" — a single positioned overlay
// reused for every cell, plus a native SVG <title> for robustness/testability.

const SVGNS = 'http://www.w3.org/2000/svg';
let overlay: HTMLDivElement | null = null;

function getOverlay(): HTMLDivElement {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'hmi-tooltip';
    Object.assign(overlay.style, {
      position: 'fixed',
      zIndex: '10010',
      pointerEvents: 'none',
      display: 'none',
      padding: '6px 8px',
      borderRadius: '3px',
      background: 'rgba(0,0,0,0.85)',
      color: '#fff',
      font: '12px sans-serif',
      maxWidth: '240px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    } as CSSStyleDeclaration);
    document.body.appendChild(overlay);
  }
  return overlay;
}

export function showTooltip(html: string, x: number, y: number): void {
  const t = getOverlay();
  t.innerHTML = html;
  t.style.display = 'block';
  t.style.left = `${x + 12}px`;
  t.style.top = `${y + 12}px`;
}

export function hideTooltip(): void {
  if (overlay) {
    overlay.style.display = 'none';
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

// Inline SVG sparkline of a numeric series.
export function sparkline(values: number[], color: string): string {
  if (!values.length) {
    return '';
  }
  const w = 140;
  const h = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const n = values.length;
  const pts = values
    .map((v, i) => `${((i / (n - 1 || 1)) * w).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(' ');
  return `<svg width="${w}" height="${h}" style="display:block;margin-top:4px"><polyline fill="none" stroke="${color}" stroke-width="1.5" points="${pts}"/></svg>`;
}

// Adds/updates a native SVG <title> child on a cell node (plain-text tooltip).
export function setNodeTitle(node: any, text: string): void {
  let title = node.querySelector ? node.querySelector('title') : null;
  if (!title) {
    title = document.createElementNS(SVGNS, 'title');
    node.insertBefore(title, node.firstChild);
  }
  title.textContent = text;
}

export function removeNodeTitle(node: any): void {
  const title = node.querySelector ? node.querySelector('title') : null;
  if (title) {
    title.remove();
  }
}

// Attaches the rich hover tooltip to a node (idempotent; replaces any previous).
export function attachCellTooltip(node: any, html: string): void {
  clearCellTooltip(node);
  const onMove = (e: MouseEvent) => showTooltip(html, e.clientX, e.clientY);
  const onLeave = () => hideTooltip();
  node.addEventListener('mousemove', onMove);
  node.addEventListener('mouseleave', onLeave);
  node.__hmiTip = { onMove, onLeave };
  node.style.cursor = 'default';
}

export function clearCellTooltip(node: any): void {
  const h = node.__hmiTip;
  if (h) {
    node.removeEventListener('mousemove', h.onMove);
    node.removeEventListener('mouseleave', h.onLeave);
    delete node.__hmiTip;
  }
}
