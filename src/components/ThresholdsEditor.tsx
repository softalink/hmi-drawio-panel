import React from 'react';
import { GrafanaTheme2 } from '@grafana/data';
import { Button, ColorPicker, IconButton, InlineField, Input, Select, Switch, useStyles2 } from '@grafana/ui';
import { css, cx } from '@emotion/css';

import { Comparator, Rule, Threshold } from '../types';
import { NUMBER_COMPARATORS, STRING_COMPARATORS } from '../constants';

interface Props {
  rule: Rule;
  onChange: (patch: Partial<Rule>) => void;
}

function newThreshold(rule: Rule): Threshold {
  return { color: '#808080', comparator: 'ge', value: rule.type === 'string' ? '/.*/' : 0, level: 0, hidden: false };
}

export const ThresholdsEditor: React.FC<Props> = ({ rule, onChange }) => {
  const styles = useStyles2(getStyles);
  const comparators = rule.type === 'string' ? STRING_COMPARATORS : NUMBER_COMPARATORS;
  const ths = rule.thresholds;

  const setTh = (idx: number, patch: Partial<Threshold>) =>
    onChange({ thresholds: ths.map((t, i) => (i === idx ? { ...t, ...patch } : t)) });
  const removeTh = (idx: number) =>
    onChange({ thresholds: ths.length > 1 ? ths.filter((_, i) => i !== idx) : ths });
  const insertBelow = (idx: number, src?: Threshold) =>
    onChange({ thresholds: [...ths.slice(0, idx + 1), src ? { ...src } : newThreshold(rule), ...ths.slice(idx + 1)] });

  return (
    <div className={styles.wrap}>
      <InlineField label="Invert" labelWidth={20} tooltip="Invert the threshold→color order">
        <Switch value={rule.invert} onChange={(e) => onChange({ invert: e.currentTarget.checked })} />
      </InlineField>
      <InlineField label="Gradient" labelWidth={20} tooltip="Interpolate color between thresholds">
        <Switch value={rule.gradient} onChange={(e) => onChange({ gradient: e.currentTarget.checked })} />
      </InlineField>
      <InlineField label="Icon state" labelWidth={20} tooltip="Show a state icon on matched cells">
        <Switch value={rule.iconState} onChange={(e) => onChange({ iconState: e.currentTarget.checked })} />
      </InlineField>

      <div className={styles.table}>
        <div className={styles.head}>
          <div>Colors</div>
          <div>When</div>
          <div>Than</div>
          <div>lvl.</div>
          <div className={styles.right}>Actions</div>
        </div>
        {ths.map((t, idx) => {
          const isBase = t.comparator === 'always';
          return (
            <div key={idx} className={cx(styles.row, t.hidden && styles.hiddenRow)}>
              <ColorPicker color={t.color} onChange={(color) => setTh(idx, { color })} />
              <div>
                {isBase ? (
                  <span className={styles.base}>Base</span>
                ) : (
                  <Select<Comparator> options={comparators} value={t.comparator} onChange={(v) => setTh(idx, { comparator: v.value ?? 'ge' })} />
                )}
              </div>
              <div>
                {isBase ? (
                  <span className={styles.base}>Base</span>
                ) : rule.type === 'string' ? (
                  <Input value={String(t.value)} placeholder="/.*/" onChange={(e) => setTh(idx, { value: e.currentTarget.value })} />
                ) : (
                  <Input
                    type="number"
                    value={Number(t.value)}
                    onChange={(e) => {
                      const n = e.currentTarget.valueAsNumber;
                      setTh(idx, { value: Number.isNaN(n) ? 0 : n });
                    }}
                  />
                )}
              </div>
              <Input
                type="number"
                value={t.level}
                onChange={(e) => {
                  const n = e.currentTarget.valueAsNumber;
                  setTh(idx, { level: Number.isNaN(n) ? 0 : n });
                }}
              />
              <div className={styles.actions}>
                <IconButton name="plus" size="sm" tooltip="Add a threshold below" onClick={() => insertBelow(idx)} />
                {!isBase && (
                  <IconButton
                    name={t.hidden ? 'eye-slash' : 'eye'}
                    size="sm"
                    tooltip={t.hidden ? 'Show/Enable this color/level' : 'Hide/Disable this color/level'}
                    onClick={() => setTh(idx, { hidden: !t.hidden })}
                  />
                )}
                {!isBase && <IconButton name="trash-alt" size="sm" tooltip="Remove" onClick={() => removeTh(idx)} />}
                <IconButton name="copy" size="sm" tooltip="Clone" onClick={() => insertBelow(idx, t)} />
              </div>
            </div>
          );
        })}
      </div>

      <Button size="sm" variant="secondary" icon="plus" onClick={() => insertBelow(ths.length - 1)}>
        Add a threshold
      </Button>
    </div>
  );
};

const COLS = '40px minmax(70px, 1fr) minmax(80px, 1.4fr) minmax(56px, 0.7fr) 132px';

const getStyles = (theme: GrafanaTheme2) => ({
  wrap: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(0.5)};
  `,
  table: css`
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    overflow: hidden;
  `,
  head: css`
    display: grid;
    grid-template-columns: ${COLS};
    gap: ${theme.spacing(0.5)};
    align-items: center;
    padding: ${theme.spacing(0.5)};
    background: ${theme.colors.background.secondary};
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
    border-bottom: 1px solid ${theme.colors.border.weak};
  `,
  row: css`
    display: grid;
    grid-template-columns: ${COLS};
    gap: ${theme.spacing(0.5)};
    align-items: center;
    padding: ${theme.spacing(0.5)};
    border-bottom: 1px solid ${theme.colors.border.weak};
    &:last-child {
      border-bottom: none;
    }
  `,
  hiddenRow: css`
    opacity: 0.5;
  `,
  right: css`
    text-align: right;
  `,
  actions: css`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: ${theme.spacing(0.25)};
  `,
  base: css`
    font-weight: ${theme.typography.fontWeightMedium};
  `,
});
