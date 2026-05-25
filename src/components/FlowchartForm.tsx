import React from 'react';
import { GrafanaTheme2, SelectableValue } from '@grafana/data';
import { Button, ColorPicker, IconButton, InlineField, Input, Select, Stack, Switch, TextArea, useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';

import { EditorTheme, Flowchart, SourceType } from '../types';
import { SOURCE_TYPES } from '../constants';
import { loadDrawio, openDrawioEditor } from '../drawio';
import { prettify, minify, encode, decode } from '../xml';

const sourceTypeOptions: Array<SelectableValue<SourceType>> = SOURCE_TYPES.map((t) => ({
  value: t.value,
  label: t.label,
}));

interface Props {
  fc: Flowchart;
  editorUrl: string;
  editorTheme: EditorTheme;
  onChange: (patch: Partial<Flowchart>) => void;
}

// The per-flowchart detail form shown when a table row is expanded.
export const FlowchartForm: React.FC<Props> = ({ fc, editorUrl, editorTheme, onChange }) => {
  const styles = useStyles2(getStyles);

  // Source-content button actions. encode/decode need the bundled viewer.
  const onPrettify = () => onChange({ xml: prettify(fc.xml) });
  const onMinify = () => onChange({ xml: minify(fc.xml) });
  const onCompress = () => loadDrawio().then(() => onChange({ xml: encode(fc.xml) }));
  const onExtract = () => loadDrawio().then(() => onChange({ xml: decode(fc.xml) }));
  const onEdit = () => openDrawioEditor(fc.xml, editorUrl, editorTheme, (xml) => onChange({ xml }));

  return (
    <Stack direction="column" gap={2}>
      {/* Definition */}
      <div className={styles.section}>
        <div className={styles.heading}>Definition</div>
        <InlineField label="Name" labelWidth={20} grow>
          <div className={styles.control}>
            <Input value={fc.name} onChange={(e) => onChange({ name: e.currentTarget.value })} />
          </div>
        </InlineField>
        <InlineField label="Download source" labelWidth={20} tooltip="Fetch the diagram from a URL instead of inline content">
          <Switch value={fc.download} onChange={(e) => onChange({ download: e.currentTarget.checked })} />
        </InlineField>
        <InlineField label="Source Type" labelWidth={20} grow>
          <div className={styles.controlSel}>
            <Select<SourceType> options={sourceTypeOptions} value={fc.type} onChange={(v) => onChange({ type: v.value ?? 'xml' })} />
          </div>
        </InlineField>

        {fc.download ? (
          <InlineField label="URL" labelWidth={20} grow tooltip="Endpoint returning xml/plain mxGraph content">
            <div className={styles.control}>
              <Input value={fc.url} placeholder="https://example.com/diagram.xml" onChange={(e) => onChange({ url: e.currentTarget.value })} />
            </div>
          </InlineField>
        ) : (
          <>
            <div className={styles.subLabel}>Source Content</div>
            <TextArea
              value={fc.xml}
              rows={10}
              spellCheck={false}
              placeholder="Paste draw.io XML (a <mxGraphModel> or a full <mxfile> export)…"
              onChange={(e) => onChange({ xml: e.currentTarget.value })}
            />
            <Stack direction="row" gap={1} wrap="wrap">
              <Button size="sm" variant="primary" icon="pen" onClick={onEdit}>
                Edit diagram
              </Button>
              <Button size="sm" variant="secondary" onClick={onPrettify}>
                Prettify
              </Button>
              <Button size="sm" variant="secondary" onClick={onMinify}>
                Minify
              </Button>
              <Button size="sm" variant="secondary" icon="compress-arrows" onClick={onCompress}>
                Compress/Encode
              </Button>
              <Button size="sm" variant="secondary" icon="expand-arrows" onClick={onExtract}>
                Extract/Decode
              </Button>
            </Stack>
          </>
        )}
      </div>

      {/* Advanced: Display */}
      <div className={styles.section}>
        <div className={styles.heading}>Display</div>
        <InlineField label="Scale" labelWidth={20} tooltip="Fit the diagram into the panel">
          <Switch value={fc.scale} onChange={(e) => onChange({ scale: e.currentTarget.checked })} />
        </InlineField>
        <InlineField label="Center" labelWidth={20} tooltip="Center the diagram in the panel">
          <Switch value={fc.center} onChange={(e) => onChange({ center: e.currentTarget.checked })} />
        </InlineField>
        <InlineField label="Grid" labelWidth={20} tooltip="Show the draw.io background grid">
          <Switch value={fc.grid} onChange={(e) => onChange({ grid: e.currentTarget.checked })} />
        </InlineField>
        <InlineField label="Bg Color" labelWidth={20} tooltip="Background color override">
          <Stack direction="row" gap={1} alignItems="center">
            <ColorPicker color={fc.bgColor || '#000000'} onChange={(color) => onChange({ bgColor: color })} />
            <span className={styles.bgText}>{fc.bgColor || 'none'}</span>
            <IconButton name="trash-alt" size="sm" tooltip="Remove background color" onClick={() => onChange({ bgColor: null })} />
          </Stack>
        </InlineField>
        {!fc.scale && (
          <InlineField label="Zoom" labelWidth={20} tooltip="Fixed zoom when Scale is off">
            <Input width={12} value={fc.zoom} placeholder="100%" onChange={(e) => onChange({ zoom: e.currentTarget.value })} />
          </InlineField>
        )}
      </div>

      {/* Advanced: Others options */}
      <div className={styles.section}>
        <div className={styles.heading}>Others options</div>
        <InlineField label="Lock" labelWidth={20} tooltip="Disable interaction with the diagram">
          <Switch value={fc.lock} onChange={(e) => onChange({ lock: e.currentTarget.checked })} />
        </InlineField>
        <InlineField label="Enable animation" labelWidth={20} tooltip="Fade cell colors when a rule changes them">
          <Switch value={fc.animation} onChange={(e) => onChange({ animation: e.currentTarget.checked })} />
        </InlineField>
        <InlineField label="Tooltip" labelWidth={20} tooltip="Enable draw.io tooltips">
          <Switch value={fc.tooltip} onChange={(e) => onChange({ tooltip: e.currentTarget.checked })} />
        </InlineField>
      </div>
    </Stack>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
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
  subLabel: css`
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
    margin-bottom: ${theme.spacing(0.5)};
  `,
  control: css`
    width: 100%;
    max-width: 320px;
  `,
  controlSel: css`
    width: 100%;
    max-width: 220px;
  `,
  bgText: css`
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
    min-width: 56px;
  `,
});
