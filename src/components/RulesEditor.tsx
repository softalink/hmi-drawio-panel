import React, { useState } from 'react';
import { GrafanaTheme2, IconName, StandardEditorProps } from '@grafana/data';
import { Button, Icon, IconButton, useStyles2 } from '@grafana/ui';
import { css, cx } from '@emotion/css';

import { BaseMap, HmiOptions, MapGroup, Rule } from '../types';
import { defaultRule } from '../constants';
import { computeRuleResult } from '../rules';
import { requestRefresh, startPick, cellValueFor, setHighlight, clearHighlight, CellChoice, HighlightMatcher } from '../diagram-bus';
import { RuleForm } from './RuleForm';

// Every non-hidden mapping row of a rule, as highlight matchers (for row hover).
function ruleMatchers(rule: Rule): HighlightMatcher[] {
  const m = rule.mappings;
  const groups: Array<MapGroup<BaseMap>> = [m.shapes, m.texts, m.links, m.events];
  const out: HighlightMatcher[] = [];
  for (const g of groups) {
    for (const row of g.list) {
      if (!row.hidden) {
        out.push({ pattern: row.pattern, options: g.options });
      }
    }
  }
  return out;
}

type Props = StandardEditorProps<Rule[], unknown, HmiOptions>;

// expand · name · metric · lvl · f.val · color · options · actions
const COLS = '28px minmax(70px, 1.2fr) minmax(70px, 1.2fr) 34px 56px 28px 84px minmax(120px, 1.4fr)';

// Mapping-group indicator icons for the Options column.
const GROUP_ICONS: Array<{ key: 'shapes' | 'texts' | 'links' | 'events'; icon: IconName; title: string }> = [
  { key: 'shapes', icon: 'circle', title: 'Color mapping' },
  { key: 'texts', icon: 'list-ul', title: 'Text mapping' },
  { key: 'links', icon: 'link', title: 'Link mapping' },
  { key: 'events', icon: 'bolt', title: 'Event/Animation mapping' },
];

export const RulesEditor: React.FC<Props> = ({ value, onChange, context }) => {
  const styles = useStyles2(getStyles);
  const rules = value || [];
  const data = context.data;

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const updateRule = (id: string, patch: Partial<Rule>) => onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRule = (id: string) => onChange(rules.filter((r) => r.id !== id));
  const cloneRule = (rule: Rule) => {
    const copy: Rule = { ...rule, id: `${rule.id}-c${Date.now()}`, name: `${rule.name} (copy)` };
    const idx = rules.findIndex((r) => r.id === rule.id);
    onChange([...rules.slice(0, idx + 1), copy, ...rules.slice(idx + 1)]);
  };
  const move = (id: string, dir: -1 | 1) => {
    const idx = rules.findIndex((r) => r.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= rules.length) {
      return;
    }
    const next = [...rules];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };
  const addRule = () => {
    const rule = defaultRule(`Rule ${rules.length + 1}`);
    onChange([...rules, rule]);
    setExpanded((prev) => new Set(prev).add(rule.id));
  };

  // Pick a cell on the diagram and point every mapping row of this rule at it
  // (each via its group's identify-by) — the original "change targets of all mapping".
  const targetRule = (rule: Rule) => {
    const retarget = <T extends BaseMap>(grp: MapGroup<T>, choice: CellChoice): MapGroup<T> => ({
      ...grp,
      list: grp.list.map((r) => ({ ...r, pattern: cellValueFor(choice, grp.options) })),
    });
    startPick({
      onPick: (choice) =>
        updateRule(rule.id, {
          mappings: {
            shapes: retarget(rule.mappings.shapes, choice),
            texts: retarget(rule.mappings.texts, choice),
            links: retarget(rule.mappings.links, choice),
            events: retarget(rule.mappings.events, choice),
          },
        }),
    });
  };

  return (
    <div className={styles.table}>
      <div className={styles.header} style={{ gridTemplateColumns: COLS }}>
        <div />
        <div className={styles.thLeft}>Rule</div>
        <div className={styles.thLeft}>Metric</div>
        <div className={styles.th}>Lvl</div>
        <div className={styles.th}>F. val.</div>
        <div className={styles.th}>Color</div>
        <div className={styles.th}>Options</div>
        <div />
      </div>

      {rules.map((rule, i) => {
        const open = expanded.has(rule.id);
        const res = data && data.length ? computeRuleResult(data, rule) : undefined;
        const metric = rule.metricPattern === '.*' ? rule.column : `${rule.metricPattern}/${rule.column}`;
        return (
          <div key={rule.id} className={styles.row}>
            <div
              className={styles.rowLine}
              style={{ gridTemplateColumns: COLS }}
              onMouseEnter={() => setHighlight({ matchers: ruleMatchers(rule) })}
              onMouseLeave={clearHighlight}
            >
              <div className={cx(styles.cell, styles.clickable)} onClick={() => toggleExpand(rule.id)} data-testid="hmi-rule-expand">
                <Icon name={open ? 'angle-down' : 'angle-right'} title="Expand/Collapse for detail" />
              </div>
              <div className={cx(styles.cellLeft, styles.clickable, styles.name)} onClick={() => toggleExpand(rule.id)} title={rule.name}>
                {rule.hidden && <Icon name="eye-slash" size="sm" className={styles.muted} />}
                {rule.name}
              </div>
              <div className={styles.cellLeft} title={metric}>
                {metric}
              </div>
              <div className={styles.cell}>{res?.defined ? res.level : '–'}</div>
              <div className={styles.cell} title={res?.formatted}>
                {res?.defined ? res.formatted : '–'}
              </div>
              <div className={styles.cell}>
                <span className={styles.swatch} style={{ background: res?.color || 'transparent' }} />
              </div>
              <div className={styles.options}>
                {GROUP_ICONS.map((g) => {
                  const active = rule.mappings[g.key].list.some((r) => !r.hidden);
                  return (
                    <span key={g.key} className={styles.iconBtn} title={`${g.title}: ${active ? 'on' : 'off'}`}>
                      <Icon name={g.icon} className={active ? styles.iconOn : styles.iconOff} />
                    </span>
                  );
                })}
              </div>
              <div className={styles.actions}>
                <IconButton
                  name="crosshair"
                  size="sm"
                  tooltip="Target a cell on the diagram (retarget this rule's mappings)"
                  onClick={() => targetRule(rule)}
                />
                <IconButton name="trash-alt" size="sm" tooltip="Remove rule" onClick={() => removeRule(rule.id)} />
                <IconButton name="copy" size="sm" tooltip="Clone rule" onClick={() => cloneRule(rule)} />
                <IconButton name={rule.hidden ? 'eye-slash' : 'eye'} size="sm" tooltip={rule.hidden ? 'Disabled' : 'Enabled'} onClick={() => updateRule(rule.id, { hidden: !rule.hidden })} />
                <IconButton name="arrow-up" size="sm" tooltip="Move up" disabled={i === 0} onClick={() => move(rule.id, -1)} />
                <IconButton name="arrow-down" size="sm" tooltip="Move down" disabled={i === rules.length - 1} onClick={() => move(rule.id, 1)} />
              </div>
            </div>

            {open && (
              <div className={styles.body} data-testid="hmi-rule-detail">
                <RuleForm
                  rule={rule}
                  series={data || []}
                  onChange={(patch) => updateRule(rule.id, patch)}
                  onClone={() => cloneRule(rule)}
                  onRemove={() => removeRule(rule.id)}
                  onCollapse={() => toggleExpand(rule.id)}
                />
              </div>
            )}
          </div>
        );
      })}

      <div className={styles.footer}>
        <Button variant="primary" icon="plus" onClick={addRule}>
          Add a rule
        </Button>
        <Button variant="secondary" icon="sync" onClick={requestRefresh}>
          Refresh
        </Button>
      </div>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  table: css`
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    overflow: hidden;
  `,
  header: css`
    display: grid;
    align-items: center;
    gap: ${theme.spacing(0.5)};
    padding: ${theme.spacing(0.5, 1)};
    background: ${theme.colors.background.secondary};
    border-bottom: 1px solid ${theme.colors.border.weak};
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
  `,
  th: css`
    text-align: center;
  `,
  thLeft: css`
    text-align: left;
  `,
  row: css`
    border-bottom: 1px solid ${theme.colors.border.weak};
    &:last-child {
      border-bottom: none;
    }
  `,
  rowLine: css`
    display: grid;
    align-items: center;
    gap: ${theme.spacing(0.5)};
    padding: ${theme.spacing(0.5, 1)};
  `,
  cell: css`
    display: flex;
    align-items: center;
    justify-content: center;
  `,
  cellLeft: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(0.5)};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  name: css`
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  clickable: css`
    cursor: pointer;
  `,
  swatch: css`
    width: 16px;
    height: 16px;
    border-radius: 3px;
    border: 1px solid ${theme.colors.border.medium};
  `,
  options: css`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: ${theme.spacing(0.25)};
  `,
  actions: css`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: ${theme.spacing(0.25)};
  `,
  iconBtn: css`
    display: inline-flex;
    align-items: center;
  `,
  iconOn: css`
    color: ${theme.colors.text.primary};
  `,
  iconOff: css`
    color: ${theme.colors.text.disabled};
  `,
  muted: css`
    color: ${theme.colors.text.disabled};
  `,
  body: css`
    padding: ${theme.spacing(1)};
    background: ${theme.colors.background.secondary};
    border-top: 1px solid ${theme.colors.border.weak};
  `,
  footer: css`
    display: flex;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(1)};
    background: ${theme.colors.background.secondary};
    border-top: 1px solid ${theme.colors.border.weak};
  `,
});
