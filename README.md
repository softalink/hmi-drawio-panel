# hmi-drawio-panel — HMI draw.io panel for Grafana

A SCADA/HMI panel plugin for Grafana that renders **draw.io / mxGraph** diagrams and
drives cell styling (fill / stroke / font color) from your metrics.

This is a **React rewrite** of the venerable
[grafana-flowcharting](https://github.com/algenty/grafana-flowcharting) plugin, brought
up to the latest stable **Grafana 13** and **draw.io 30**. The original plugin was an
AngularJS panel; AngularJS support was removed in Grafana 11, so it cannot run on modern
Grafana at all. The original AngularJS source lives in the upstream
[grafana-flowcharting](https://github.com/algenty/grafana-flowcharting) repository and is
used as a reference for porting further features.

- **Grafana:** targets `>=13.0.0` (verified against 13.0.1)
- **draw.io:** 30.0.2 static viewer, bundled offline at `src/libs/drawio/`
- **No AngularJS:** a proper React `PanelPlugin` (`angular.detected: false`)

## Features (MVP)

- Render any draw.io diagram — paste raw `<mxGraphModel>` XML or a full `<mxfile>` export
  (compressed diagrams are supported); ships with a small default synoptic.
- **Coloring rules** that map a metric to diagram cells:
  - pick the metric by regex over the field/series name and reduce it
    (last / mean / max / min / first / sum / count);
  - select target cells by regex over their **id** or **label**;
  - apply **fill / stroke / font** color via thresholds (highest threshold ≤ value wins;
    below all thresholds the cell keeps its original color).
- Fits and centers the diagram in the panel.

Roadmap (not yet ported from the original): tooltips, value/text/icon overrides, link
overrides, mappings, events, the inspect tab, and multi-page diagrams.

## Architecture

- `src/components/HmiPanel.tsx` — the panel: loads the viewer, renders the diagram, and
  re-applies rules when data or options change.
- `src/drawio.ts` — loads the bundled draw.io static viewer (+ DOMPurify) and exposes
  render / cell-styling helpers around the global `GraphViewer`.
- `src/rules.ts` — reduces panel data to metric values and applies rules to the graph.
- `src/components/{XmlEditor,RulesEditor}.tsx` — panel option editors.
- `webpack.config.ts` — extends the managed `.config` webpack to ship `src/libs` to
  `dist/libs` (the `.config` folder itself is left untouched).

## Develop

```bash
npm install

# production build (outputs to dist/)
npm run build

# watch / dev build
npm run dev

# typecheck / lint
npm run typecheck
npm run lint
```

## Test environment

A ready-to-run test environment is provisioned under [`provisioning/`](./provisioning)
so the plugin can be verified **from scratch with no manual setup** (no creating
datasources or dashboards in the UI):

```bash
npm install
npm run build       # produces dist/, which is mounted into the container
docker compose up   # Grafana 13 + this plugin + provisioned datasource & dashboard
```

Then open **http://localhost:3000** — anonymous access is enabled, so no login is needed
— and open the **"HMI demo dashboard"**.

- `docker-compose.yaml` builds Grafana **13.0.1** (pinned here because the plugin needs
  `>=13.0.0`; override with `GRAFANA_VERSION=...`) and loads the unsigned plugin from
  `dist/`.
- `provisioning/datasources/datasources.yml` — a **TestData** datasource
  (`grafana-testdata-datasource`, uid `trlxrdZVk`, default) that supplies seed data.
- `provisioning/dashboards/` — the **HMI demo dashboard**: a process synoptic
  (pump → tank → valve → sensor + alarm) whose cells are recolored, animated, labelled
  and linked by rules driven by live random-walk metrics
  (flow / level / pressure / temperature / status). Each cell carries an annotation
  describing the rule and mappings configured for it.

`npm run server` is a convenience alias for `docker compose up --build` (rebuilds the
Grafana image as well).

End-to-end test (Playwright):

```bash
npm run server   # in one terminal
npm run e2e       # in another
```

## Signing & distribution

When distributing a Grafana plugin it must be signed so Grafana can verify its
authenticity, using the `@grafana/sign-plugin` package. Signing is not required during
development — the Docker dev environment runs the plugin unsigned.

See the Grafana [plugin publishing and signing](https://grafana.com/legal/plugins/#plugin-publishing-and-signing-criteria)
docs and [`plugin.json` reference](https://grafana.com/developers/plugin-tools/reference/plugin-json).
