import React from 'react';
import { DataFrame, GrafanaTheme2, getFieldDisplayName } from '@grafana/data';
import { Button, InlineField, Input, Select, Switch, UnitPicker, useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';

import {
  Aggregation,
  ColorApplyOn,
  ColorTarget,
  Comparator,
  EventMap,
  EventMethod,
  LinkApplyOn,
  LinkMap,
  LinkType,
  Rule,
  RuleType,
  ShapeMap,
  TextApplyOn,
  TextMap,
  TextMethod,
} from '../types';
import {
  AGGREGATIONS,
  COLOR_APPLYON,
  COLOR_TARGETS,
  EVENT_METHODS,
  LINK_APPLYON,
  LINK_TYPES,
  NUMBER_COMPARATORS,
  RULE_TYPES,
  TEXT_APPLYON,
  TEXT_METHODS,
} from '../constants';
import { findInternalOption, useInternalLinkOptions } from '../internal-links';
import { MappingTable } from './MappingTable';
import { ThresholdsEditor } from './ThresholdsEditor';

interface Props {
  rule: Rule;
  series: DataFrame[];
  onChange: (patch: Partial<Rule>) => void;
  onClone: () => void;
  onRemove: () => void;
  onCollapse: () => void;
}

const LW = 20; // label width (units) — fits the longest labels on one line
const rid = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const eventMethodOptions = EVENT_METHODS.map((m) => ({ label: m.label, value: m.value }));
const isNumericMethod = (m: EventMethod) => EVENT_METHODS.find((e) => e.value === m)?.numeric ?? false;
const opt = (v: string) => ({ label: v, value: v });

export const RuleForm: React.FC<Props> = ({ rule, series, onChange, onClone, onRemove, onCollapse }) => {
  const styles = useStyles2(getStyles);
  const m = rule.mappings;
  const internalLinks = useInternalLinkOptions();

  // Metric / column dropdown choices from the panel data.
  const metricOptions = Array.from(new Set(series.map((f) => f.name || f.refId || '').filter(Boolean))).map(opt);
  const columnOptions = (() => {
    let re: RegExp | null = null;
    try {
      re = new RegExp(rule.metricPattern || '.*');
    } catch (e) {
      re = null;
    }
    const names = new Set<string>();
    for (const f of series) {
      const fname = f.name || f.refId || '';
      if (re && !re.test(fname)) {
        continue;
      }
      for (const fld of f.fields) {
        names.add(getFieldDisplayName(fld, f, series));
      }
    }
    return Array.from(names).map(opt);
  })();
  const metricVal = metricOptions.find((o) => o.value === rule.metricPattern) || opt(rule.metricPattern);
  const columnVal = columnOptions.find((o) => o.value === rule.column) || opt(rule.column);

  return (
    <div className={styles.form}>
      {/* Options */}
      <Section title="Options">
        <InlineField label="Rule name" labelWidth={LW} grow>
          <div className={styles.control}>
            <Input value={rule.name} onChange={(e) => onChange({ name: e.currentTarget.value })} />
          </div>
        </InlineField>
        <InlineField label="Apply to metrics" labelWidth={LW} grow tooltip="Series/frame name (pick one or type a regex)">
          <div className={styles.control}>
            <Select allowCustomValue placeholder=".*" options={metricOptions} value={metricVal} onChange={(v) => onChange({ metricPattern: (v?.value ?? '') as string })} />
          </div>
        </InlineField>
        <InlineField label="Apply to column" labelWidth={LW} grow tooltip="Field/column name (pick one or type a regex)">
          <div className={styles.control}>
            <Select allowCustomValue placeholder=".*" options={columnOptions} value={columnVal} onChange={(v) => onChange({ column: (v?.value ?? '') as string })} />
          </div>
        </InlineField>
        <InlineField label="Aggregation" labelWidth={LW} grow>
          <div className={styles.controlSel}>
            <Select<Aggregation> options={AGGREGATIONS} value={rule.aggregation} onChange={(v) => onChange({ aggregation: v.value ?? 'last' })} />
          </div>
        </InlineField>
      </Section>

      {/* Type */}
      <Section title="Type">
        <InlineField label="Type" labelWidth={LW} grow>
          <div className={styles.controlSel}>
            <Select<RuleType> options={RULE_TYPES} value={rule.type} onChange={(v) => onChange({ type: v.value ?? 'number' })} />
          </div>
        </InlineField>
        <InlineField label="Unit" labelWidth={LW} grow>
          <div className={styles.control}>
            <UnitPicker value={rule.unit} onChange={(unit) => onChange({ unit })} />
          </div>
        </InlineField>
        <InlineField label="Decimals" labelWidth={LW}>
          <Input
            type="number"
            width={12}
            value={rule.decimals}
            onChange={(e) => {
              const n = e.currentTarget.valueAsNumber;
              onChange({ decimals: Number.isNaN(n) ? 0 : n });
            }}
          />
        </InlineField>
      </Section>

      {/* Thresholds */}
      <Section title="Thresholds">
        <ThresholdsEditor rule={rule} onChange={onChange} />
      </Section>

      {/* Tooltips */}
      <Section title="Tooltips">
        <InlineField label="Display metrics" labelWidth={LW} tooltip="Show the metric value in a tooltip on hover">
          <Switch value={rule.tooltip.enabled} onChange={(e) => onChange({ tooltip: { ...rule.tooltip, enabled: e.currentTarget.checked } })} />
        </InlineField>
        {rule.tooltip.enabled && (
          <>
            <InlineField label="Label" labelWidth={LW} grow>
              <div className={styles.control}>
                <Input value={rule.tooltip.label} placeholder="(rule name)" onChange={(e) => onChange({ tooltip: { ...rule.tooltip, label: e.currentTarget.value } })} />
              </div>
            </InlineField>
            <InlineField label="Colorize value" labelWidth={LW}>
              <Switch value={rule.tooltip.colors} onChange={(e) => onChange({ tooltip: { ...rule.tooltip, colors: e.currentTarget.checked } })} />
            </InlineField>
            <InlineField label="Graph" labelWidth={LW} tooltip="Show a sparkline of the series">
              <Switch value={rule.tooltip.graph} onChange={(e) => onChange({ tooltip: { ...rule.tooltip, graph: e.currentTarget.checked } })} />
            </InlineField>
          </>
        )}
      </Section>

      {/* Color/Tooltip Mappings */}
      <Section title="Color/Tooltip Mappings">
        <MappingTable<ShapeMap>
          group={m.shapes}
          onChange={(g) => onChange({ mappings: { ...m, shapes: g } })}
          newRow={() => ({ id: rid('shp'), pattern: '.*', hidden: false, style: 'fillColor', applyOn: 'a' })}
          columns={[
            {
              header: 'How',
              render: (row, update) => (
                <Select<ColorTarget> options={COLOR_TARGETS} value={row.style} onChange={(v) => update({ style: v.value ?? 'fillColor' })} />
              ),
            },
            {
              header: 'When',
              render: (row, update) => (
                <Select<ColorApplyOn> options={COLOR_APPLYON} value={row.applyOn} onChange={(v) => update({ applyOn: v.value ?? 'a' })} />
              ),
            },
          ]}
        />
      </Section>

      {/* Label/Text Mappings */}
      <Section title="Label/Text Mappings">
        <MappingTable<TextMap>
          group={m.texts}
          onChange={(g) => onChange({ mappings: { ...m, texts: g } })}
          newRow={() => ({ id: rid('txt'), pattern: '.*', hidden: false, textReplace: 'content', textPattern: '/.*/', applyOn: 'wmd' })}
          columns={[
            {
              header: 'How',
              render: (row, update) => (
                <Select<TextMethod> options={TEXT_METHODS} value={row.textReplace} onChange={(v) => update({ textReplace: v.value ?? 'content' })} />
              ),
            },
            {
              header: 'With',
              render: (row, update) =>
                row.textReplace === 'pattern' ? (
                  <Input value={row.textPattern} placeholder="/RegEx/" onChange={(e) => update({ textPattern: e.currentTarget.value })} />
                ) : (
                  <span className={styles.muted}>—</span>
                ),
            },
            {
              header: 'When',
              render: (row, update) => (
                <Select<TextApplyOn> options={TEXT_APPLYON} value={row.applyOn} onChange={(v) => update({ applyOn: v.value ?? 'wmd' })} />
              ),
            },
          ]}
        />
      </Section>

      {/* Link Mappings */}
      <Section title="Link Mappings">
        <MappingTable<LinkMap>
          group={m.links}
          onChange={(g) => onChange({ mappings: { ...m, links: g } })}
          newRow={() => ({ id: rid('lnk'), pattern: '.*', hidden: false, linkType: 'external', url: '', params: false, applyOn: 'a' })}
          columns={[
            {
              header: 'Type',
              render: (row, update) => (
                <Select<LinkType>
                  options={LINK_TYPES}
                  value={row.linkType ?? 'external'}
                  // Clear the target when switching kinds: an external URL is not a
                  // valid internal path and vice-versa.
                  onChange={(v) => update({ linkType: v.value ?? 'external', url: '' })}
                />
              ),
            },
            {
              header: 'URL',
              render: (row, update) =>
                (row.linkType ?? 'external') === 'internal' ? (
                  <Select<string>
                    placeholder="Select dashboard or page"
                    options={internalLinks.options as any}
                    isLoading={internalLinks.loading}
                    value={findInternalOption(internalLinks.options, row.url)}
                    onChange={(v) => update({ url: v?.value ?? '' })}
                  />
                ) : (
                  <Input value={row.url} placeholder="https://…" onChange={(e) => update({ url: e.currentTarget.value })} />
                ),
            },
            {
              header: 'Params',
              grow: false,
              render: (row, update) => <Switch value={row.params} onChange={(e) => update({ params: e.currentTarget.checked })} />,
            },
            {
              header: 'When',
              render: (row, update) => (
                <Select<LinkApplyOn> options={LINK_APPLYON} value={row.applyOn} onChange={(v) => update({ applyOn: v.value ?? 'a' })} />
              ),
            },
          ]}
        />
      </Section>

      {/* Event/Animation Mappings */}
      <Section title="Event/Animation Mappings">
        <MappingTable<EventMap>
          group={m.events}
          onChange={(g) => onChange({ mappings: { ...m, events: g } })}
          newRow={() => ({ id: rid('evt'), pattern: '.*', hidden: false, method: 'shape', comparator: 'ge', level: 0, value: '' })}
          columns={[
            {
              header: 'When',
              render: (row, update) => (
                <Select<Comparator> options={NUMBER_COMPARATORS} value={row.comparator} onChange={(v) => update({ comparator: v.value ?? 'ge' })} />
              ),
            },
            {
              header: 'Lvl',
              render: (row, update) => (
                <Input
                  type="number"
                  value={row.level}
                  onChange={(e) => {
                    const n = e.currentTarget.valueAsNumber;
                    update({ level: Number.isNaN(n) ? 0 : n });
                  }}
                />
              ),
            },
            {
              header: 'Then',
              render: (row, update) => (
                <Select<EventMethod> options={eventMethodOptions} value={row.method} onChange={(v) => update({ method: v.value ?? 'shape' })} />
              ),
            },
            {
              header: 'With',
              render: (row, update) => (
                <Input
                  type={isNumericMethod(row.method) ? 'number' : 'text'}
                  value={row.value}
                  placeholder={EVENT_METHODS.find((e) => e.value === row.method)?.placeholder}
                  onChange={(e) => update({ value: e.currentTarget.value })}
                />
              ),
            },
          ]}
        />
      </Section>

      <div className={styles.footer}>
        <Button size="sm" variant="secondary" icon="copy" onClick={onClone}>
          Clone the rule
        </Button>
        <Button size="sm" variant="secondary" icon="angle-up" onClick={onCollapse}>
          Collapse the rule
        </Button>
        <Button size="sm" variant="destructive" icon="trash-alt" onClick={onRemove}>
          Remove the Rule
        </Button>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const styles = useStyles2(getStyles);
  return (
    <div className={styles.section}>
      <div className={styles.heading}>{title}</div>
      {children}
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  form: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(2)};
  `,
  section: css`
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(1)};
    background: ${theme.colors.background.primary};
  `,
  heading: css`
    font-size: ${theme.typography.h6.fontSize};
    margin-bottom: ${theme.spacing(1)};
    color: ${theme.colors.text.primary};
  `,
  muted: css`
    color: ${theme.colors.text.disabled};
  `,
  control: css`
    width: 100%;
    max-width: 320px;
  `,
  controlSel: css`
    width: 100%;
    max-width: 220px;
  `,
  footer: css`
    display: flex;
    gap: ${theme.spacing(1)};
    flex-wrap: wrap;
  `,
});
