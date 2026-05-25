// A module-level singleton that lets the panel options editors talk to the
// rendered panel (they live in separate React trees but the same bundle):
//  - cell registry: the panel publishes the diagram's cells; editors read them
//    to populate the "What" dropdowns.
//  - picker: an editor requests "pick a cell"; the panel halos cells on hover
//    and reports the clicked cell's identifier back.
//  - refresh: an editor asks the panel to re-render the diagram.
import { IdentifyBy, MapOptions } from './types';

export interface CellChoice {
  id: string;
  label: string;
  metadata: Record<string, string>;
}

type Listener = () => void;

// --- cell registry ---------------------------------------------------------
let cellChoices: CellChoice[] = [];
const choiceListeners = new Set<Listener>();

export function setCellChoices(choices: CellChoice[]): void {
  cellChoices = choices;
  choiceListeners.forEach((l) => l());
}
export function getCellChoices(): CellChoice[] {
  return cellChoices;
}
export function subscribeCellChoices(l: Listener): () => void {
  choiceListeners.add(l);
  return () => choiceListeners.delete(l);
}

// --- picker ----------------------------------------------------------------
// The panel returns the whole picked cell; callers map it via cellValueFor so
// each mapping group can use its own identify-by.
export interface PickRequest {
  onPick: (choice: CellChoice) => void;
}
let pickReq: PickRequest | null = null;
const pickListeners = new Set<Listener>();

export function startPick(req: PickRequest): void {
  pickReq = req;
  pickListeners.forEach((l) => l());
}
export function cancelPick(): void {
  pickReq = null;
  pickListeners.forEach((l) => l());
}
export function getPick(): PickRequest | null {
  return pickReq;
}
export function isPicking(): boolean {
  return pickReq !== null;
}
export function subscribePick(l: Listener): () => void {
  pickListeners.add(l);
  return () => pickListeners.delete(l);
}
// Called by the panel once a cell is chosen; resolves the active request.
export function completePick(choice: CellChoice): void {
  const req = pickReq;
  pickReq = null;
  pickListeners.forEach((l) => l());
  if (req) {
    req.onPick(choice);
  }
}

// The identifier of a picked cell for a given mapping group's identify-by.
export function cellValueFor(choice: CellChoice, options: { identifyBy: IdentifyBy; metadata: string }): string {
  if (options.identifyBy === 'label') {
    return choice.label;
  }
  if (options.identifyBy === 'metadata') {
    return choice.metadata[options.metadata] || '';
  }
  return choice.id;
}

// --- highlight (hover a mapping "What" / a rule row to halo matching cells) --
export interface HighlightMatcher {
  pattern: string;
  options: MapOptions;
}
export interface HighlightRequest {
  // A cell is haloed when it matches ANY of these (a single mapping, or all of
  // a rule's mappings when hovering its row).
  matchers: HighlightMatcher[];
}
let highlightReq: HighlightRequest | null = null;
const highlightListeners = new Set<Listener>();

export function setHighlight(req: HighlightRequest): void {
  highlightReq = req;
  highlightListeners.forEach((l) => l());
}
export function clearHighlight(): void {
  if (!highlightReq) {
    return;
  }
  highlightReq = null;
  highlightListeners.forEach((l) => l());
}
export function getHighlight(): HighlightRequest | null {
  return highlightReq;
}
export function subscribeHighlight(l: Listener): () => void {
  highlightListeners.add(l);
  return () => highlightListeners.delete(l);
}

// --- refresh ---------------------------------------------------------------
let refreshTick = 0;
const refreshListeners = new Set<Listener>();

export function requestRefresh(): void {
  refreshTick++;
  refreshListeners.forEach((l) => l());
}
export function getRefreshTick(): number {
  return refreshTick;
}
export function subscribeRefresh(l: Listener): () => void {
  refreshListeners.add(l);
  return () => refreshListeners.delete(l);
}
