import {
  Aggregation,
  ColorApplyOn,
  ColorTarget,
  Comparator,
  EditorTheme,
  EventMethod,
  Flowchart,
  IdentifyBy,
  LinkApplyOn,
  LinkType,
  MapOptions,
  Rule,
  RuleType,
  SourceType,
  TextApplyOn,
  TextMethod,
  Threshold,
} from './types';

export const PLUGIN_ID = 'softalink-hmidrawio-panel';

// Paths (relative to the plugin base URL) of the bundled draw.io assets.
// DOMPurify must load before the viewer: GraphViewer references it as a global
// to sanitize HTML cell labels.
export const DRAWIO_PURIFY_PATH = 'libs/drawio/purify.min.js';
export const DRAWIO_VIEWER_PATH = 'libs/drawio/viewer-static.min.js';

// Default address of the draw.io editor opened by "Edit diagram".
export const DEFAULT_EDITOR_URL = 'https://embed.diagrams.net/';

// Editor themes (ui=<value>). Labels mirror the original plugin.
export const EDITOR_THEMES: Array<{ label: string; value: EditorTheme }> = [
  { label: 'Dark', value: 'dark' },
  { label: 'Light', value: 'kennedy' },
  { label: 'Mobile', value: 'minimal' },
  { label: 'atlas', value: 'atlas' },
];

export const SOURCE_TYPES: Array<{ label: string; value: SourceType }> = [{ label: 'XML', value: 'xml' }];

// Color-fade animation (Enable animation): interpolate over COLOR_STEPS frames.
export const ANIM_COLOR_STEPS = 10;
export const ANIM_COLOR_MS = 25;

// A showcase synoptic whose cells (pump/tank/valve/sensor/alarm + the pump→tank
// edge) are targeted by defaultRules() to demonstrate every mapping kind. Bind
// random metrics named flow/level/pressure/temperature/status to see it live.
export const DEFAULT_XML = `<mxGraphModel dx="900" dy="500" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <mxCell id="pump" value="Pump" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="40" y="160" width="120" height="60" as="geometry" />
    </mxCell>
    <mxCell id="tank" value="Tank" style="shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;fillColor=#d5e8d4;strokeColor=#82b366;fontColor=#333333;" vertex="1" parent="1">
      <mxGeometry x="260" y="130" width="110" height="120" as="geometry" />
    </mxCell>
    <mxCell id="valve" value="Valve" style="rhombus;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;strokeWidth=3;" vertex="1" parent="1">
      <mxGeometry x="470" y="160" width="90" height="60" as="geometry" />
    </mxCell>
    <mxCell id="sensor" value="Sensor" style="ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="660" y="160" width="90" height="60" as="geometry" />
    </mxCell>
    <mxCell id="alarm" value="ALARM" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontStyle=1;" vertex="1" parent="1">
      <mxGeometry x="690" y="40" width="100" height="50" as="geometry" />
    </mxCell>
    <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeWidth=2;strokeColor=#cccccc;" edge="1" parent="1" source="pump" target="tank">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="e2" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeWidth=2;strokeColor=#cccccc;" edge="1" parent="1" source="tank" target="valve">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="e3" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeWidth=2;strokeColor=#cccccc;" edge="1" parent="1" source="valve" target="sensor">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="txt-pump" value="&lt;b&gt;PUMP&lt;/b&gt; &#8212; rule on flow&lt;br&gt;&#8226; Color: fill (always)&lt;br&gt;&#8226; Link: grafana.com&lt;br&gt;&#8226; Tooltip: value + sparkline&lt;br&gt;&#8226; Edge e1: flow animation" style="text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;spacing=4;fontSize=11;fontColor=#cccccc;" vertex="1" parent="1">
      <mxGeometry x="10" y="10" width="210" height="100" as="geometry" />
    </mxCell>
    <mxCell id="txt-tank" value="&lt;b&gt;TANK&lt;/b&gt; &#8212; rule on level (%)&lt;br&gt;&#8226; Color: fill (gradient) + font (warn/crit)&lt;br&gt;&#8226; Text: show value (when displayed)" style="text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;spacing=4;fontSize=11;fontColor=#cccccc;" vertex="1" parent="1">
      <mxGeometry x="230" y="10" width="190" height="90" as="geometry" />
    </mxCell>
    <mxCell id="txt-valve" value="&lt;b&gt;VALVE&lt;/b&gt; &#8212; rule on pressure&lt;br&gt;&#8226; Color: stroke (always)&lt;br&gt;&#8226; Event: rotate 30&#176; (warning)&lt;br&gt;&#8226; Event: fade 40% (critical)" style="text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;spacing=4;fontSize=11;fontColor=#cccccc;" vertex="1" parent="1">
      <mxGeometry x="440" y="10" width="185" height="90" as="geometry" />
    </mxCell>
    <mxCell id="txt-alarm" value="&lt;b&gt;ALARM&lt;/b&gt; &#8212; rule on status (max)&lt;br&gt;&#8226; Color: fill (always)&lt;br&gt;&#8226; Event: hidden when OK (status=0)" style="text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;spacing=4;fontSize=11;fontColor=#cccccc;" vertex="1" parent="1">
      <mxGeometry x="635" y="-78" width="220" height="64" as="geometry" />
    </mxCell>
    <mxCell id="txt-sensor" value="&lt;b&gt;SENSOR&lt;/b&gt; &#8212; rule on temperature (mean, inverted)&lt;br&gt;&#8226; Color: fill (always)&lt;br&gt;&#8226; Event: blink (critical)&lt;br&gt;&#8226; Tooltip: value + sparkline" style="text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;spacing=4;fontSize=11;fontColor=#cccccc;" vertex="1" parent="1">
      <mxGeometry x="620" y="92" width="340" height="66" as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>`;

// ---------------------------------------------------------------------------
// Rule option lists
// ---------------------------------------------------------------------------

export const AGGREGATIONS: Array<{ label: string; value: Aggregation }> = [
  { label: 'First', value: 'first' },
  { label: 'First (not null)', value: 'first_notnull' },
  { label: 'Last', value: 'last' },
  { label: 'Last (not null)', value: 'last_notnull' },
  { label: 'Min', value: 'min' },
  { label: 'Max', value: 'max' },
  { label: 'Sum', value: 'sum' },
  { label: 'Avg', value: 'mean' },
  { label: 'Count', value: 'count' },
  { label: 'Delta', value: 'delta' },
  { label: 'Range', value: 'range' },
  { label: 'Diff', value: 'diff' },
  { label: 'Time of last point', value: 'last_time' },
];

export const COLOR_APPLYON: Array<{ label: string; value: ColorApplyOn }> = [
  { label: 'Never', value: 'n' },
  { label: 'Warning / Critical', value: 'wc' },
  { label: 'Always', value: 'a' },
];

export const TEXT_APPLYON: Array<{ label: string; value: TextApplyOn }> = [
  { label: 'Never', value: 'n' },
  { label: 'When Metric Displayed', value: 'wmd' },
  { label: 'Warning / Critical', value: 'wc' },
  { label: 'Critical Only', value: 'co' },
];

export const LINK_APPLYON: Array<{ label: string; value: LinkApplyOn }> = [
  { label: 'Warning / Critical', value: 'wc' },
  { label: 'Always', value: 'a' },
];

export const LINK_TYPES: Array<{ label: string; value: LinkType }> = [
  { label: 'External', value: 'external' },
  { label: 'Internal', value: 'internal' },
];

export const RULE_TYPES: Array<{ label: string; value: RuleType }> = [
  { label: 'Number', value: 'number' },
  { label: 'String', value: 'string' },
  { label: 'Date', value: 'date' },
];

export const IDENTIFY_BY: Array<{ label: string; value: IdentifyBy }> = [
  { label: 'Id', value: 'id' },
  { label: 'Label', value: 'label' },
  { label: 'Metadata', value: 'metadata' },
];

// Comparators offered in the threshold table (per rule type). 'always' is the
// Base row and is not user-selectable in the dropdown.
export const NUMBER_COMPARATORS: Array<{ label: string; value: Comparator }> = [
  { label: '≥', value: 'ge' },
  { label: '>', value: 'gt' },
  { label: '≤', value: 'le' },
  { label: '<', value: 'lt' },
  { label: '=', value: 'eq' },
  { label: '≠', value: 'ne' },
];

export const STRING_COMPARATORS: Array<{ label: string; value: Comparator }> = [
  { label: '=', value: 'eq' },
  { label: '≠', value: 'ne' },
];

export const COLOR_TARGETS: Array<{ label: string; value: ColorTarget }> = [
  { label: 'Shape Fill', value: 'fillColor' },
  { label: 'Shape Stroke/Border', value: 'strokeColor' },
  { label: 'Shape Gradient', value: 'gradientColor' },
  { label: 'Label font color', value: 'fontColor' },
  { label: 'Label background color', value: 'labelBackgroundColor' },
  { label: 'Label border color', value: 'labelBorderColor' },
  { label: 'Image background', value: 'imageBackground' },
  { label: 'Image border', value: 'imageBorder' },
];

export const TEXT_METHODS: Array<{ label: string; value: TextMethod }> = [
  { label: 'All content', value: 'content' },
  { label: 'Substring', value: 'pattern' },
  { label: 'Append (Space)', value: 'as' },
  { label: 'Append (New line)', value: 'anl' },
];

// Event/Animation "Then" actions (from the original EVENTMETHODS). `numeric`
// marks methods whose `value` is a number; `placeholder`/`def` seed the input.
export const EVENT_METHODS: Array<{
  label: string;
  value: EventMethod;
  numeric: boolean;
  placeholder?: string;
  def?: string;
}> = [
  { label: 'Shape : Change form (text)', value: 'shape', numeric: false, placeholder: 'Shape name' },
  { label: 'Shape : Rotate (0-360)', value: 'rotation', numeric: true, placeholder: '0-360', def: '0' },
  { label: 'Shape : Blink (frequence ms)', value: 'blink', numeric: true, placeholder: 'ms', def: '500' },
  { label: 'Shape : Hide/Show (0|1)', value: 'visibility', numeric: true, placeholder: '0 or 1' },
  { label: 'Shape : Height (px)', value: 'height', numeric: true, placeholder: 'px' },
  { label: 'Shape : Width (px)', value: 'width', numeric: true, placeholder: 'px' },
  { label: 'Shape : Resize (percent)', value: 'size', numeric: true, placeholder: 'percent' },
  { label: 'Shape : Opacity (0-100)', value: 'opacity', numeric: true, placeholder: '0-100', def: '100' },
  { label: 'Shape : Gradient direction', value: 'gradientDirection', numeric: false, placeholder: 'south|east|north|west', def: 'south' },
  { label: 'Shape : Collapse/Expand (0|1)', value: 'fold', numeric: true, placeholder: '0 or 1', def: '1' },
  { label: 'Shape : Flip horizontally (0|1)', value: 'flipH', numeric: true, placeholder: '0 or 1' },
  { label: 'Shape : Flip vertically (0|1)', value: 'flipV', numeric: true, placeholder: '0 or 1' },
  { label: 'Shape : Position in Bar (0-100)', value: 'barPos', numeric: true, placeholder: '0-100' },
  { label: 'Shape : Position in Gauge (0-100)', value: 'gaugePos', numeric: true, placeholder: '0-100' },
  { label: 'Arrow : start marker (text)', value: 'startArrow', numeric: false, placeholder: 'Marker' },
  { label: 'Arrow : end marker (text)', value: 'endArrow', numeric: false, placeholder: 'Marker' },
  { label: 'Arrow : Anime flow (ms)', value: 'class_mxEdgeFlow', numeric: true, placeholder: 'ms' },
  { label: 'Label : Replace text (text)', value: 'text', numeric: false, placeholder: 'Text' },
  { label: 'Label : Font Size (numeric)', value: 'fontSize', numeric: true, placeholder: 'Number' },
  { label: 'Label : Opacity (0-100)', value: 'textOpacity', numeric: true, placeholder: '0-100', def: '100' },
  { label: 'Image : Change URL (text)', value: 'image', numeric: false, placeholder: 'Url' },
  { label: 'Tooltip : text', value: 'tpText', numeric: false, placeholder: 'text' },
  { label: 'Tooltip : metadata (key@value)', value: 'tpMetadata', numeric: false, placeholder: 'key@value' },
];

function rid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export function defaultMapOptions(): MapOptions {
  return { identifyBy: 'id', metadata: '', regex: true };
}

// A fresh rule with a sensible threshold ladder and one fill-color mapping.
export function defaultRule(name = 'New rule'): Rule {
  return {
    id: rid('rule'),
    name,
    order: 1,
    hidden: false,
    metricPattern: '.*',
    column: '.*',
    aggregation: 'last',
    type: 'number',
    unit: 'short',
    decimals: 2,
    invert: false,
    gradient: false,
    iconState: false,
    thresholds: [
      { color: '#F2495C', comparator: 'always', value: 0, level: 2, hidden: false },
      { color: '#FF9830', comparator: 'ge', value: 50, level: 1, hidden: false },
      { color: '#73BF69', comparator: 'ge', value: 80, level: 0, hidden: false },
    ],
    tooltip: { enabled: false, label: '', colors: false, graph: false },
    mappings: {
      shapes: { options: defaultMapOptions(), list: [{ id: rid('shp'), pattern: '.*', hidden: false, style: 'fillColor', applyOn: 'a' }] },
      texts: { options: defaultMapOptions(), list: [] },
      links: { options: defaultMapOptions(), list: [] },
      events: { options: defaultMapOptions(), list: [] },
    },
  };
}

// Threshold ladder used by the showcase rules: ok(green) below 50, warning
// (orange) >= 50, critical(red) >= 80. Higher value = more critical.
function showcaseLadder(): Threshold[] {
  return [
    { color: '#73BF69', comparator: 'always', value: 0, level: 0, hidden: false },
    { color: '#FF9830', comparator: 'ge', value: 50, level: 1, hidden: false },
    { color: '#F2495C', comparator: 'ge', value: 80, level: 2, hidden: false },
  ];
}

// The demo rule set: each rule targets a cell in DEFAULT_XML and exercises a
// different mapping kind (color fill/stroke/font, text, link, events
// rotation/opacity/blink/visibility/edge-flow, tooltip+graph, gradient, invert).
// Bind random metrics flow/level/pressure/temperature/status to drive them.
export function defaultRules(): Rule[] {
  const o = defaultMapOptions;
  const base = (over: Partial<Rule>): Rule => ({
    id: rid('rule'),
    name: 'Rule',
    order: 1,
    hidden: false,
    metricPattern: '.*',
    column: '.*',
    aggregation: 'last',
    type: 'number',
    unit: 'short',
    decimals: 0,
    invert: false,
    gradient: false,
    iconState: false,
    thresholds: showcaseLadder(),
    tooltip: { enabled: false, label: '', colors: false, graph: false },
    mappings: {
      shapes: { options: o(), list: [] },
      texts: { options: o(), list: [] },
      links: { options: o(), list: [] },
      events: { options: o(), list: [] },
    },
    ...over,
  });
  return [
    // Pump: fill color from thresholds + value tooltip with sparkline + a link.
    base({
      name: 'Pump (flow)',
      column: '^flow$',
      tooltip: { enabled: true, label: 'Flow', colors: true, graph: true },
      mappings: {
        shapes: { options: o(), list: [{ id: rid('shp'), pattern: '^pump$', hidden: false, style: 'fillColor', applyOn: 'a' }] },
        texts: { options: o(), list: [] },
        links: { options: o(), list: [{ id: rid('lnk'), pattern: '^pump$', hidden: false, linkType: 'external', url: 'https://grafana.com', params: false, applyOn: 'a' }] },
        events: { options: o(), list: [] },
      },
    }),
    // Tank: gradient fill + font color (warning/critical) + label shows the value.
    base({
      name: 'Tank (level)',
      column: '^level$',
      unit: 'percent',
      gradient: true,
      mappings: {
        shapes: {
          options: o(),
          list: [
            { id: rid('shp'), pattern: '^tank$', hidden: false, style: 'fillColor', applyOn: 'a' },
            { id: rid('shp'), pattern: '^tank$', hidden: false, style: 'fontColor', applyOn: 'wc' },
          ],
        },
        texts: { options: o(), list: [{ id: rid('txt'), pattern: '^tank$', hidden: false, textReplace: 'content', textPattern: '/.*/', applyOn: 'wmd' }] },
        links: { options: o(), list: [] },
        events: { options: o(), list: [] },
      },
    }),
    // Valve: stroke color + rotate (warning) + fade (critical).
    base({
      name: 'Valve (pressure)',
      column: '^pressure$',
      mappings: {
        shapes: { options: o(), list: [{ id: rid('shp'), pattern: '^valve$', hidden: false, style: 'strokeColor', applyOn: 'a' }] },
        texts: { options: o(), list: [] },
        links: { options: o(), list: [] },
        events: {
          options: o(),
          list: [
            { id: rid('evt'), pattern: '^valve$', hidden: false, method: 'rotation', comparator: 'ge', level: 1, value: '30' },
            { id: rid('evt'), pattern: '^valve$', hidden: false, method: 'opacity', comparator: 'ge', level: 2, value: '40' },
          ],
        },
      },
    }),
    // Sensor: fill + blink when critical; inverted thresholds; mean aggregation; tooltip.
    base({
      name: 'Sensor (temp)',
      column: '^temperature$',
      aggregation: 'mean',
      invert: true,
      tooltip: { enabled: true, label: 'Temp', colors: true, graph: true },
      mappings: {
        shapes: { options: o(), list: [{ id: rid('shp'), pattern: '^sensor$', hidden: false, style: 'fillColor', applyOn: 'a' }] },
        texts: { options: o(), list: [] },
        links: { options: o(), list: [] },
        events: { options: o(), list: [{ id: rid('evt'), pattern: '^sensor$', hidden: false, method: 'blink', comparator: 'ge', level: 2, value: '400' }] },
      },
    }),
    // Alarm: fill + visibility (hidden while OK); max aggregation.
    base({
      name: 'Alarm (status)',
      column: '^status$',
      aggregation: 'max',
      mappings: {
        shapes: { options: o(), list: [{ id: rid('shp'), pattern: '^alarm$', hidden: false, style: 'fillColor', applyOn: 'a' }] },
        texts: { options: o(), list: [] },
        links: { options: o(), list: [] },
        events: { options: o(), list: [{ id: rid('evt'), pattern: '^alarm$', hidden: false, method: 'visibility', comparator: 'eq', level: 0, value: '0' }] },
      },
    }),
    // Flow edge: animate the pump->tank edge when flowing.
    base({
      name: 'Flow (edge)',
      column: '^flow$',
      mappings: {
        shapes: { options: o(), list: [] },
        texts: { options: o(), list: [] },
        links: { options: o(), list: [] },
        events: { options: o(), list: [{ id: rid('evt'), pattern: '^e1$', hidden: false, method: 'class_mxEdgeFlow', comparator: 'ge', level: 1, value: '600' }] },
      },
    }),
  ];
}

// Upgrade a rule saved in the old simple shape ({ metric, reducer, matchType,
// pattern, style, thresholds: [{value,color}] }) to the full model. Idempotent:
// a rule that already has `mappings` is returned unchanged.
export function migrateRule(old: any): Rule {
  if (old && old.mappings && old.thresholds && typeof old.thresholds[0] === 'object' && 'comparator' in old.thresholds[0]) {
    return old as Rule;
  }
  const oldTh: Array<{ value: number; color: string }> = Array.isArray(old?.thresholds) ? old.thresholds : [];
  const sorted = [...oldTh].sort((a, b) => a.value - b.value);
  // Highest value -> level 0; convert each to a 'ge' threshold (no base, so
  // values below all thresholds keep the cell's original color, as before).
  const thresholds: Threshold[] = sorted.map((t, i) => ({
    color: t.color,
    comparator: 'ge',
    value: t.value,
    level: sorted.length - 1 - i,
    hidden: false,
  }));
  return {
    id: old?.id ?? rid('rule'),
    name: old?.name ?? 'Rule',
    order: 1,
    hidden: false,
    metricPattern: '.*',
    column: old?.metric ?? '.*',
    aggregation: old?.reducer ?? 'last',
    type: 'number',
    unit: 'short',
    decimals: 2,
    invert: false,
    gradient: false,
    iconState: false,
    thresholds,
    tooltip: { enabled: false, label: '', colors: false, graph: false },
    mappings: {
      shapes: {
        options: { identifyBy: old?.matchType === 'label' ? 'label' : 'id', metadata: '', regex: true },
        list: [{ id: rid('shp'), pattern: old?.pattern ?? '.*', hidden: false, style: old?.style ?? 'fillColor', applyOn: 'a' }],
      },
      texts: { options: defaultMapOptions(), list: [] },
      links: { options: defaultMapOptions(), list: [] },
      events: { options: defaultMapOptions(), list: [] },
    },
  };
}

// A fresh flowchart with the upstream default options.
export function defaultFlowchart(name = 'Main', xml: string = DEFAULT_XML): Flowchart {
  return {
    id: `fc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name,
    type: 'xml',
    download: false,
    url: '',
    xml,
    scale: true,
    center: true,
    grid: false,
    bgColor: null,
    zoom: '100%',
    lock: true,
    animation: true,
    tooltip: true,
  };
}
