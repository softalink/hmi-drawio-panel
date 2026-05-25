import React, { useEffect, useRef, useState } from 'react';
import { PanelProps } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';

import { HmiOptions } from '../types';
import {
  loadDrawio,
  renderDiagram,
  setAllowDrawioResources,
  getDrawableCells,
  getCellLabel,
  getCellAllMetadata,
  installPicker,
  installWheelZoom,
  installPan,
  installDoubleClickZoom,
  highlightCells,
  RenderResult,
} from '../drawio';
import { applyRules, matchPattern, cellIdentifier, RenderEntry } from '../rules';
import {
  setCellChoices,
  subscribePick,
  getPick,
  completePick,
  subscribeRefresh,
  subscribeHighlight,
  getHighlight,
  CellChoice,
} from '../diagram-bus';

function buildChoices(entries: RenderEntry[]): CellChoice[] {
  const map = new Map<string, CellChoice>();
  for (const e of entries) {
    for (const cell of getDrawableCells(e.graph)) {
      const id = String(cell.id);
      if (!map.has(id)) {
        map.set(id, { id, label: getCellLabel(e.graph, cell), metadata: getCellAllMetadata(cell) });
      }
    }
  }
  return [...map.values()];
}

interface Props extends PanelProps<HmiOptions> {}

const getStyles = () => ({
  wrapper: css`
    position: relative;
    overflow: hidden;
  `,
  layer: css`
    position: absolute;
    top: 0;
    left: 0;
  `,
  error: css`
    position: absolute;
    top: 4px;
    left: 4px;
    right: 4px;
    padding: 6px 8px;
    border-radius: 2px;
    background: rgba(209, 14, 92, 0.9);
    color: #fff;
    font-size: 12px;
    z-index: 100;
  `,
});

async function resolveXml(fc: HmiOptions['flowcharts'][number]): Promise<string> {
  if (fc.download && fc.url) {
    const res = await fetch(fc.url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.text();
  }
  return fc.xml;
}

export const HmiPanel: React.FC<Props> = ({ options, data, width, height }) => {
  const styles = useStyles2(getStyles);
  const containers = useRef<Map<string, HTMLDivElement>>(new Map());
  const entriesRef = useRef<RenderEntry[]>([]);
  const interactionCleanups = useRef<Array<() => void>>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const flowcharts = options.flowcharts || [];

  // Editor "Refresh" buttons force a full re-render of the diagram.
  useEffect(() => subscribeRefresh(() => setRefreshKey((k) => k + 1)), []);

  // Pick mode: while an editor is picking, halo cells on hover and report the
  // clicked cell's identifier (id/label/metadata) back to the editor.
  useEffect(() => {
    let cleanups: Array<() => void> = [];
    const sync = () => {
      cleanups.forEach((c) => c());
      cleanups = [];
      const req = getPick();
      if (!req) {
        return;
      }
      for (const e of entriesRef.current) {
        cleanups.push(
          installPicker(e.graph, (cell) => {
            if (!getPick()) {
              return;
            }
            completePick({
              id: String(cell.id),
              label: getCellLabel(e.graph, cell),
              metadata: getCellAllMetadata(cell),
            });
          })
        );
      }
    };
    const unsub = subscribePick(sync);
    return () => {
      unsub();
      cleanups.forEach((c) => c());
    };
  }, []);

  // Hovering a mapping's "What" in an editor halos the cells it matches.
  useEffect(() => {
    let dispose: Array<() => void> = [];
    const sync = () => {
      dispose.forEach((d) => d());
      dispose = [];
      const req = getHighlight();
      if (!req) {
        return;
      }
      for (const e of entriesRef.current) {
        const cells = getDrawableCells(e.graph).filter((c) =>
          req.matchers.some((m) => matchPattern(cellIdentifier(e.graph, c, m.options), m.pattern, m.options.regex))
        );
        if (cells.length) {
          dispose.push(highlightCells(e.graph, cells));
        }
      }
    };
    const unsub = subscribeHighlight(sync);
    return () => {
      unsub();
      dispose.forEach((d) => d());
    };
  }, []);

  // (Re)render every flowchart when its definition/options or the size change.
  useEffect(() => {
    let cancelled = false;
    setError(null);

    loadDrawio()
      .then(async () => {
        if (cancelled) {
          return;
        }
        setAllowDrawioResources(!!options.allowDrawioResources, options.editorUrl);

        // Remove wheel-zoom listeners from the previous render (containers persist).
        interactionCleanups.current.forEach((c) => c());
        interactionCleanups.current = [];

        const entries: RenderEntry[] = [];
        const errors: string[] = [];
        for (const fc of flowcharts) {
          const container = containers.current.get(fc.id);
          if (!container) {
            continue;
          }
          try {
            const xml = await resolveXml(fc);
            if (cancelled) {
              return;
            }
            const result: RenderResult = renderDiagram(container, { ...fc, xml }, width, height);
            entries.push({
              graph: result.graph,
              baseStyles: result.baseStyles,
              baseValues: result.baseValues,
              baseGeometries: result.baseGeometries,
              fc,
            });
            interactionCleanups.current.push(installWheelZoom(result.graph, container));
            interactionCleanups.current.push(installPan(result.graph, container));
            interactionCleanups.current.push(installDoubleClickZoom(result.graph, fc));
          } catch (e: any) {
            container.innerHTML = '';
            errors.push(`${fc.name}: ${e?.message ?? String(e)}`);
          }
        }
        if (cancelled) {
          return;
        }
        entriesRef.current = entries;
        applyRules(entries, options.rules || [], data.series);
        setCellChoices(buildChoices(entries));
        setError(errors.length ? errors.join(' · ') : null);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message ?? String(e));
        }
      });

    return () => {
      cancelled = true;
      interactionCleanups.current.forEach((c) => c());
      interactionCleanups.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(flowcharts), width, height, options.allowDrawioResources, options.editorUrl, refreshKey]);

  // Re-apply rules when data or rules change (no full diagram re-render needed).
  useEffect(() => {
    if (!entriesRef.current.length) {
      return;
    }
    try {
      applyRules(entriesRef.current, options.rules || [], data.series);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, options.rules]);

  return (
    <div className={styles.wrapper} style={{ width, height }} data-testid="hmi-diagram">
      {flowcharts.map((fc) => (
        <div
          key={fc.id}
          className={styles.layer}
          ref={(el) => {
            if (el) {
              containers.current.set(fc.id, el);
            } else {
              containers.current.delete(fc.id);
            }
          }}
        />
      ))}
      {error && <div className={styles.error}>HMI: {error}</div>}
    </div>
  );
};
