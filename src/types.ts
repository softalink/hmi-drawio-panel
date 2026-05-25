// ---------------------------------------------------------------------------
// Flowcharts
// ---------------------------------------------------------------------------

// Theme passed to the draw.io editor opened by "Edit diagram" (ui=<value>).
export type EditorTheme = 'dark' | 'kennedy' | 'minimal' | 'atlas';

// Source of a flowchart's diagram. Only XML for now (CSV import deferred).
export type SourceType = 'xml';

export interface Flowchart {
  id: string;
  name: string;

  // --- Definition ---
  type: SourceType;
  download: boolean;
  url: string;
  xml: string;

  // --- Advanced: Display ---
  scale: boolean;
  center: boolean;
  grid: boolean;
  bgColor: string | null;
  zoom: string;

  // --- Advanced: Others ---
  lock: boolean;
  animation: boolean;
  tooltip: boolean;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

// Aggregation applied to the matched field to obtain a single value.
export type Aggregation =
  | 'first'
  | 'first_notnull'
  | 'last'
  | 'last_notnull'
  | 'min'
  | 'max'
  | 'sum'
  | 'mean'
  | 'count'
  | 'delta'
  | 'range'
  | 'diff'
  | 'last_time';

// When a color/text/link mapping applies, relative to the rule's current level.
export type ColorApplyOn = 'n' | 'wc' | 'a'; // Never / Warning-Critical / Always
export type TextApplyOn = 'n' | 'wmd' | 'wc' | 'co'; // + When-displayed / Critical-only
export type LinkApplyOn = 'wc' | 'a';
// External = a normal URL (opens in a new tab); Internal = an in-app dashboard or
// page path, navigated via the SPA router (like clicking the left nav).
export type LinkType = 'external' | 'internal';

// Value type a rule evaluates / formats.
export type RuleType = 'number' | 'string' | 'date';

// Threshold comparators (the union is validated per rule type at evaluation).
export type Comparator = 'always' | 'ge' | 'gt' | 'le' | 'lt' | 'eq' | 'ne';

// How a mapping selects cells.
export type IdentifyBy = 'id' | 'label' | 'metadata';

// Color target ("How") for a Color/Tooltip (shape) mapping.
export type ColorTarget =
  | 'fillColor'
  | 'strokeColor'
  | 'gradientColor'
  | 'fontColor'
  | 'labelBackgroundColor'
  | 'labelBorderColor'
  | 'imageBackground'
  | 'imageBorder';

// Text replacement method for a Label/Text mapping.
export type TextMethod = 'content' | 'pattern' | 'as' | 'anl';

// Event/Animation "Then" action.
export type EventMethod =
  | 'shape'
  | 'rotation'
  | 'blink'
  | 'visibility'
  | 'height'
  | 'width'
  | 'size'
  | 'opacity'
  | 'gradientDirection'
  | 'fold'
  | 'flipH'
  | 'flipV'
  | 'startArrow'
  | 'endArrow'
  | 'class_mxEdgeFlow'
  | 'text'
  | 'fontSize'
  | 'textOpacity'
  | 'image'
  | 'tpText'
  | 'tpMetadata'
  | 'barPos'
  | 'gaugePos';

export interface Threshold {
  // Color applied (and `level`) when `value` satisfies `comparator` against the
  // rule value. The base threshold uses comparator 'always'. Higher level =
  // more critical (level 0 = ok).
  color: string;
  comparator: Comparator;
  value: number | string;
  level: number;
  hidden: boolean; // skipped during evaluation when true
}

export interface MapOptions {
  identifyBy: IdentifyBy;
  metadata: string; // metadata key when identifyBy === 'metadata'
  regex: boolean; // treat the row pattern as a regular expression
}

export interface BaseMap {
  id: string;
  pattern: string; // matched against the cell id / label / metadata
  hidden: boolean;
}

// Color/Tooltip mapping — colors matched cells using the rule's current color.
export interface ShapeMap extends BaseMap {
  style: ColorTarget;
  applyOn: ColorApplyOn;
}

// Label/Text mapping — replaces matched cells' text.
export interface TextMap extends BaseMap {
  textReplace: TextMethod;
  textPattern: string; // regex used when textReplace === 'pattern'
  applyOn: TextApplyOn;
}

// Link mapping — adds a clickable URL to matched cells.
export interface LinkMap extends BaseMap {
  linkType: LinkType; // external URL vs internal dashboard/page (default 'external')
  url: string; // external: the URL; internal: the in-app path (e.g. /d/<uid>)
  params: boolean; // append Grafana variables / time range to the URL
  applyOn: LinkApplyOn;
}

// Event/Animation mapping — applies `method`(`value`) when the rule level
// satisfies `comparator` against this mapping's `level`.
export interface EventMap extends BaseMap {
  method: EventMethod;
  comparator: Comparator;
  level: number;
  value: string;
}

export interface MapGroup<T extends BaseMap> {
  options: MapOptions;
  list: T[];
}

export interface RuleMappings {
  shapes: MapGroup<ShapeMap>;
  texts: MapGroup<TextMap>;
  links: MapGroup<LinkMap>;
  events: MapGroup<EventMap>;
}

export interface RuleTooltip {
  enabled: boolean; // Display metrics
  label: string;
  colors: boolean; // colorize the tooltip value
  graph: boolean; // show a sparkline of the series
}

export interface Rule {
  id: string;
  name: string;
  order: number;
  hidden: boolean;

  // Options (metric selection)
  metricPattern: string; // Apply to metrics (frame/series name regex)
  column: string; // Apply to column (field name regex)
  aggregation: Aggregation;

  // Type
  type: RuleType;
  unit: string;
  decimals: number;

  // Thresholds
  invert: boolean;
  gradient: boolean;
  iconState: boolean;
  thresholds: Threshold[];

  // Tooltip
  tooltip: RuleTooltip;

  // Mappings
  mappings: RuleMappings;
}

export interface HmiOptions {
  // --- Global ---
  editorUrl: string;
  editorTheme: EditorTheme;
  allowDrawioResources: boolean;

  flowcharts: Flowchart[];
  rules: Rule[];
}
