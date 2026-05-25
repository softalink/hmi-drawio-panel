import React, { useState } from 'react';
import { GrafanaTheme2, IconName, StandardEditorProps } from '@grafana/data';
import { Button, ColorPicker, Icon, IconButton, useStyles2 } from '@grafana/ui';
import { css, cx } from '@emotion/css';

import { Flowchart, HmiOptions } from '../types';
import { defaultFlowchart } from '../constants';
import { openDrawioEditor } from '../drawio';
import { requestRefresh } from '../diagram-bus';
import { FlowchartForm } from './FlowchartForm';

type Props = StandardEditorProps<Flowchart[], unknown, HmiOptions>;

// Grid template shared by the header and every row line so columns stay aligned:
// expand · name · type · source · bg · options · remove
const COLS = '28px minmax(90px, 1.6fr) 40px 48px 64px minmax(150px, 2fr) 32px';

export const FlowchartsEditor: React.FC<Props> = ({ value, onChange, context }) => {
  const styles = useStyles2(getStyles);
  const flowcharts = value && value.length ? value : [defaultFlowchart()];
  const editorUrl = context.options?.editorUrl ?? '';
  const editorTheme = context.options?.editorTheme ?? 'kennedy';

  // Expanded rows are local UI state — not persisted into the saved dashboard.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const updateFc = (id: string, patch: Partial<Flowchart>) =>
    onChange(flowcharts.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const addFlowchart = () => {
    const fc = defaultFlowchart(`Flowchart ${flowcharts.length + 1}`);
    onChange([...flowcharts, fc]);
    setExpanded((prev) => new Set(prev).add(fc.id));
  };
  const removeFlowchart = (id: string) => {
    if (flowcharts.length <= 1) {
      return;
    }
    onChange(flowcharts.filter((f) => f.id !== id));
  };

  // A clickable (or static) state icon for the Options column.
  const toggleIcon = (icon: IconName, on: boolean, title: string, onClick?: () => void) => {
    const inner = <Icon name={icon} className={on ? styles.iconOn : styles.iconOff} />;
    return onClick ? (
      <button type="button" className={styles.iconBtn} title={title} onClick={onClick}>
        {inner}
      </button>
    ) : (
      <span className={styles.iconBtn} title={title}>
        {inner}
      </span>
    );
  };

  return (
    <div className={styles.table}>
      {/* Header */}
      <div className={styles.header} style={{ gridTemplateColumns: COLS }}>
        <div />
        <div className={styles.thLeft}>Flowchart name</div>
        <div className={styles.th}>Type</div>
        <div className={styles.th}>source</div>
        <div className={styles.th}>BG Col.</div>
        <div className={styles.th}>Options</div>
        <div />
      </div>

      {/* Rows */}
      {flowcharts.map((fc) => {
        const open = expanded.has(fc.id);
        return (
          <div key={fc.id} className={styles.row}>
            <div className={styles.rowLine} style={{ gridTemplateColumns: COLS }}>
              {/* expand */}
              <div
                className={cx(styles.cell, styles.clickable)}
                onClick={() => toggleExpand(fc.id)}
                data-testid="hmi-fc-expand"
              >
                <Icon name={open ? 'angle-down' : 'angle-right'} title="Expand/Collapse for detail" />
              </div>
              {/* name */}
              <div className={cx(styles.cellLeft, styles.clickable, styles.name)} onClick={() => toggleExpand(fc.id)} title={fc.name}>
                {fc.name}
              </div>
              {/* type */}
              <div className={styles.cell}>{toggleIcon('brackets-curly', true, 'Draw.io XML format')}</div>
              {/* source */}
              <div className={styles.cell}>
                {fc.download
                  ? toggleIcon('cloud-download', true, fc.url ? `URL: ${fc.url}` : 'Download from URL')
                  : toggleIcon('file-alt', true, 'Edit diagram', () =>
                      openDrawioEditor(fc.xml, editorUrl, editorTheme, (xml) => updateFc(fc.id, { xml }))
                    )}
              </div>
              {/* background */}
              <div className={styles.cell}>
                {fc.bgColor ? (
                  <span className={styles.bgWrap}>
                    <ColorPicker color={fc.bgColor} onChange={(c) => updateFc(fc.id, { bgColor: c })} />
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title="Remove background color"
                      onClick={() => updateFc(fc.id, { bgColor: null })}
                    >
                      <Icon name="times" className={styles.iconOff} />
                    </button>
                  </span>
                ) : (
                  <ColorPicker color="#000000" onChange={(c) => updateFc(fc.id, { bgColor: c })}>
                    {({ ref, showColorPicker, hideColorPicker }) => (
                      <button
                        type="button"
                        ref={ref as React.Ref<HTMLButtonElement>}
                        className={styles.iconBtn}
                        title="Set background color"
                        onClick={showColorPicker}
                        onMouseLeave={hideColorPicker}
                      >
                        <Icon name="circle" className={styles.iconOff} />
                      </button>
                    )}
                  </ColorPicker>
                )}
              </div>
              {/* options */}
              <div className={styles.options}>
                {toggleIcon('expand-arrows', fc.scale, `Scale/fit: ${fc.scale ? 'on' : 'off'}`, () => updateFc(fc.id, { scale: !fc.scale }))}
                {toggleIcon('horizontal-align-center', fc.center, `Center: ${fc.center ? 'on' : 'off'}`, () => updateFc(fc.id, { center: !fc.center }))}
                {toggleIcon('comment-alt', fc.tooltip, `Tooltip: ${fc.tooltip ? 'on' : 'off'}`, () => updateFc(fc.id, { tooltip: !fc.tooltip }))}
                {toggleIcon('apps', fc.grid, `Grid: ${fc.grid ? 'on' : 'off'}`, () => updateFc(fc.id, { grid: !fc.grid }))}
                {toggleIcon(fc.lock ? 'lock' : 'unlock', fc.lock, `Lock: ${fc.lock ? 'on' : 'off'}`, () => updateFc(fc.id, { lock: !fc.lock }))}
                {toggleIcon('capture', fc.animation, `Animation: ${fc.animation ? 'on' : 'off'}`, () => updateFc(fc.id, { animation: !fc.animation }))}
                {toggleIcon('search-plus', !fc.scale && fc.zoom !== '100%', `Zoom: ${fc.zoom}`)}
              </div>
              {/* remove */}
              <div className={styles.cell}>
                <IconButton
                  name="trash-alt"
                  size="sm"
                  tooltip={flowcharts.length <= 1 ? 'Keep at least one flowchart' : 'Remove flowchart'}
                  disabled={flowcharts.length <= 1}
                  onClick={() => removeFlowchart(fc.id)}
                />
              </div>
            </div>

            {open && (
              <div className={styles.body} data-testid="hmi-fc-detail">
                <FlowchartForm
                  fc={fc}
                  editorUrl={editorUrl}
                  editorTheme={editorTheme}
                  onChange={(patch) => updateFc(fc.id, patch)}
                />
              </div>
            )}
          </div>
        );
      })}

      <div className={styles.footer}>
        <Button size="sm" variant="secondary" icon="plus" onClick={addFlowchart}>
          Add flowchart
        </Button>
        <Button size="sm" variant="secondary" icon="sync" onClick={requestRefresh}>
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
  options: css`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: ${theme.spacing(0.25)};
    flex-wrap: nowrap;
  `,
  bgWrap: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(0.5)};
  `,
  iconBtn: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    padding: 2px;
    cursor: pointer;
    color: inherit;
  `,
  iconOn: css`
    color: ${theme.colors.text.primary};
  `,
  iconOff: css`
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
