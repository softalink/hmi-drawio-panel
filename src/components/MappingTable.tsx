import React, { useEffect, useState } from 'react';
import { GrafanaTheme2 } from '@grafana/data';
import { Button, IconButton, InlineField, Input, Select, Switch, useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';

import { BaseMap, IdentifyBy, MapGroup, MapOptions } from '../types';
import { IDENTIFY_BY } from '../constants';
import {
  CellChoice,
  getCellChoices,
  subscribeCellChoices,
  startPick,
  requestRefresh,
  cellValueFor,
  setHighlight,
  clearHighlight,
} from '../diagram-bus';

export interface MapColumn<T> {
  header: string;
  render: (row: T, update: (patch: Partial<T>) => void) => React.ReactNode;
  // When false, the cell keeps the control at its natural size instead of
  // stretching it to fill the column (e.g. a toggle Switch).
  grow?: boolean;
}

interface Props<T extends BaseMap> {
  group: MapGroup<T>;
  onChange: (group: MapGroup<T>) => void;
  newRow: () => T;
  columns: Array<MapColumn<T>>;
}

// Generic editor for a mapping group: the Identify-by / Regex options plus a
// table of rows. "What" is a combobox of the diagram's cells (by identify-by)
// with a bull's-eye picker; group-specific columns and row actions follow.
export function MappingTable<T extends BaseMap>({ group, onChange, newRow, columns }: Props<T>) {
  const styles = useStyles2(getStyles);
  const [choices, setChoices] = useState<CellChoice[]>(getCellChoices());
  useEffect(() => subscribeCellChoices(() => setChoices(getCellChoices())), []);

  const cols = `minmax(170px, 1.8fr) ${columns.map(() => 'minmax(110px, 1fr)').join(' ')} 124px`;

  const setOption = (patch: Partial<MapOptions>) => onChange({ ...group, options: { ...group.options, ...patch } });
  const updateRow = (id: string, patch: Partial<T>) =>
    onChange({ ...group, list: group.list.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const removeRow = (id: string) => onChange({ ...group, list: group.list.filter((r) => r.id !== id) });
  const cloneRow = (row: T) => onChange({ ...group, list: [...group.list, { ...row, id: `${row.id}-c${Date.now()}` }] });
  const addRow = () => onChange({ ...group, list: [...group.list, newRow()] });

  // "What" dropdown values for the current identify-by.
  const idBy = group.options.identifyBy;
  const values = choices
    .map((c) => (idBy === 'label' ? c.label : idBy === 'metadata' ? c.metadata[group.options.metadata] || '' : c.id))
    .filter((v) => v && v.length > 0);
  const whatOptions = Array.from(new Set(values)).map((v) => ({ label: v, value: v }));

  const pick = (row: T) =>
    startPick({
      onPick: (choice) => updateRow(row.id, { pattern: cellValueFor(choice, group.options) } as Partial<T>),
    });

  return (
    <div className={styles.wrap}>
      <InlineField label="Identify by" labelWidth={20} grow>
        <div className={styles.controlSel}>
          <Select<IdentifyBy>
            options={IDENTIFY_BY}
            value={group.options.identifyBy}
            onChange={(v) => setOption({ identifyBy: v.value ?? 'id' })}
          />
        </div>
      </InlineField>
      {group.options.identifyBy === 'metadata' && (
        <InlineField label="Metadata key" labelWidth={20} grow>
          <div className={styles.control}>
            <Input value={group.options.metadata} onChange={(e) => setOption({ metadata: e.currentTarget.value })} />
          </div>
        </InlineField>
      )}
      <InlineField label="Regular expression" labelWidth={20}>
        <Switch value={group.options.regex} onChange={(e) => setOption({ regex: e.currentTarget.checked })} />
      </InlineField>

      <div className={styles.table}>
        <div className={styles.head} style={{ gridTemplateColumns: cols }}>
          <div>What</div>
          {columns.map((c) => (
            <div key={c.header}>{c.header}</div>
          ))}
          <div className={styles.right}>Actions</div>
        </div>
        {group.list.map((row) => {
          const current = whatOptions.find((o) => o.value === row.pattern) || { label: row.pattern, value: row.pattern };
          return (
            <div key={row.id} className={styles.row} style={{ gridTemplateColumns: cols }}>
              <div
                className={styles.what}
                data-testid="hmi-map-what"
                onMouseEnter={() => setHighlight({ matchers: [{ pattern: row.pattern, options: group.options }] })}
                onMouseLeave={clearHighlight}
              >
                <Select
                  allowCustomValue
                  placeholder="/.*/"
                  options={whatOptions}
                  value={current}
                  onChange={(v) => updateRow(row.id, { pattern: (v?.value ?? '') as string } as Partial<T>)}
                  formatOptionLabel={(o) => (
                    // Fill the option row so hovering anywhere on it (not just the
                    // text) halos the cell this value matches.
                    <span
                      style={{ display: 'block', width: '100%' }}
                      onMouseEnter={() => setHighlight({ matchers: [{ pattern: String(o.value ?? ''), options: group.options }] })}
                      onMouseLeave={clearHighlight}
                    >
                      {o.label}
                    </span>
                  )}
                />
              </div>
              {columns.map((c) => (
                <div key={c.header} className={c.grow === false ? styles.cellNoGrow : styles.cell}>
                  {c.render(row, (patch) => updateRow(row.id, patch))}
                </div>
              ))}
              <div className={styles.actions}>
                <IconButton name="trash-alt" size="sm" tooltip="Remove" onClick={() => removeRow(row.id)} />
                <IconButton
                  name={row.hidden ? 'eye-slash' : 'eye'}
                  size="sm"
                  tooltip={row.hidden ? 'Disabled' : 'Enabled'}
                  onClick={() => updateRow(row.id, { hidden: !row.hidden } as Partial<T>)}
                />
                <IconButton name="crosshair" size="sm" tooltip="Pick a cell on the diagram" onClick={() => pick(row)} />
                <IconButton name="copy" size="sm" tooltip="Clone" onClick={() => cloneRow(row)} />
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <Button size="sm" variant="secondary" icon="plus" onClick={addRow}>
          Add a mapping
        </Button>
        <Button size="sm" variant="secondary" icon="sync" onClick={requestRefresh}>
          Refresh
        </Button>
      </div>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrap: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(0.5)};
  `,
  control: css`
    width: 100%;
    max-width: 320px;
  `,
  controlSel: css`
    width: 100%;
    max-width: 220px;
  `,
  table: css`
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    /* The row is a wide grid; in the narrow panel-options pane let it scroll
       horizontally instead of clipping the right-hand columns. Select menus
       portal to <body>, so dropdowns are not clipped by this. */
    overflow-x: auto;
    overflow-y: hidden;
  `,
  head: css`
    display: grid;
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
    gap: ${theme.spacing(0.5)};
    align-items: center;
    padding: ${theme.spacing(0.5)};
    border-bottom: 1px solid ${theme.colors.border.weak};
    &:last-child {
      border-bottom: none;
    }
  `,
  what: css`
    min-width: 0;
    & > * {
      width: 100%;
    }
  `,
  cell: css`
    display: flex;
    align-items: center;
    & > * {
      width: 100%;
    }
  `,
  cellNoGrow: css`
    display: flex;
    align-items: center;
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
  footer: css`
    display: flex;
    gap: ${theme.spacing(1)};
  `,
});
