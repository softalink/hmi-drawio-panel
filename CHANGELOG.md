# Changelog

## 1.0.2 (2026-05-26)

### Changed

- **Build provenance:** the release artifact is now built via GitHub Actions
  (`.github/workflows/release.yml`) using `grafana/plugin-actions/build-plugin`
  with `attestation: true`. A signed SLSA build provenance attestation is
  attached to the release, resolving the `no-provenance-attestation`
  plugincheck2 finding. No source code changes.

## 1.0.1 (2026-05-26)

### Fixed — plugincheck2 scan findings (v1.0.0)

- **serialize-javascript HIGH (GHSA-5c6j-r48x-rmvq):** pinned transitive dev dep
  to `^7.0.5` via npm `overrides`.
- **code-rules-window-open-without-noopener (`src/drawio.ts`):** the editor popup
  now opens with `noopener,noreferrer`; reply path switched to
  `event.source.postMessage` since the WindowProxy handle is null with noopener.
  Programmatic `win.close()` is no longer possible — the user closes the editor
  window manually.
- **code-rules-direct-window-location-access (`src/rules.ts`):** replaced
  `new URLSearchParams(window.location.search)` with
  `locationService.getSearch()` from `@grafana/runtime`.
- **`src/drawio.ts` navigateInternal:** removed remaining `window.location.origin`
  and `window.location.assign` calls (not flagged on this scan but same rule).

## 1.0.0 (2026-05-25)

Initial release.

### Added — main configuration UI (parity with grafana-flowcharting)

- **Global options:** Editor URL & theme (used by "Edit diagram"), Allow draw.io source.
- **Multi-flowchart support:** add/remove/select multiple diagrams, rendered stacked;
  rules apply across all layers.
- **Definition:** Source Type, inline Source Content or Download-from-URL, and the
  Edit diagram / Prettify / Minify / Compress·Encode / Extract·Decode buttons
  (compress/decompress reuse the bundled draw.io viewer).
- **Display:** Scale, Center, Grid, Bg Color (with clear), Zoom (when Scale is off).
- **Others:** Lock, Enable animation (color-fade on rule changes), Tooltip.
- Migration handler upgrades old `{ xml, fit, rules }` panels to the flowcharts model.

### Added — full Rules engine (parity with grafana-flowcharting)

- **Foldable Rules table:** rows collapsed by default with a live summary (Lvl / F. val.
  / Color computed from the panel data) and per-row clone / hide / reorder / remove;
  expanding a row reveals the full rule form.
- **Options:** Apply to metrics, Apply to column, Aggregation.
- **Type:** Number / String / Date, Unit, Decimals (Grafana value formatting).
- **Thresholds:** Invert, Gradient, Icon state, and a Color/When(comparator)/Than/level
  table with a Base threshold.
- **Mappings (identify by id/label/metadata, regex):**
  - *Color/Tooltip* — drive any of 8 color targets on matched cells.
  - *Label/Text* — replace cell text (all content / substring / append).
  - *Link* — clickable cell links with dashboard-variable substitution.
  - *Event/Animation* — level-gated: shape/rotation/blink/visibility/size/width/height/
    opacity/fold/flip/arrows/edge-flow/fontSize/text/image/tooltip-metadata.
- **Tooltips:** Display metrics on hover (value, optional colorized, optional sparkline).
- Migration upgrades the old simple rule shape to the new model.

Deferred / not supported by the offline static viewer: CSV source type; the `barPos` /
`gaugePos` events (require draw.io bar/gauge shape internals).

### Packaging

- Plugin **id renamed to `softalink-hmidrawio-panel`** (from `scada-hmi-panel`) ahead of catalog
  registration. Signing now targets a **community** ("grafana") signature (no `--rootUrls`);
  this requires the id to be registered/approved in Grafana's catalog first.

### Added — Internal vs External link mappings

- Link mappings gain an **External / Internal** toggle. *External* keeps the usual
  behavior (a typed URL that opens in a new tab). *Internal* turns the URL field into a
  dropdown of in-app destinations — all **dashboards** (from `/api/search`) plus the
  left-nav **pages** (Home, Explore, Alerting, …, from the boot nav tree). Clicking a cell
  with an Internal link performs an in-app **SPA route change** (`locationService.push`),
  exactly like clicking that item in the left navigation — no new tab, no full reload.
- Mapping tables now scroll horizontally in the narrow panel-options pane so every column
  stays reachable.
- The demo's *Pump* cell now uses an Internal link to a new provisioned **"HMI detail"**
  dashboard to showcase the feature.

### Test environment

- Provisioned a from-scratch test environment per Grafana's
  [Provide a test environment](https://grafana.com/developers/plugin-tools/publish-a-plugin/provide-test-environment)
  guide: `docker compose up` (no env vars) builds a compatible **Grafana 13.0.1**
  (pinned in the root `docker-compose.yaml`), loads the plugin, and provisions a
  **TestData** datasource (`grafana-testdata-datasource`, uid `trlxrdZVk`, default) plus
  the **HMI demo dashboard** — the panel renders with live threshold colors and no manual
  setup. Documented in `README.md` and `provisioning/README.md`.

### Refined — Rules parity with the original

- Per-mapping **"When"** gating for Color/Text/Link (Never / Warning-Critical / Always /
  When-displayed / Critical-only).
- **Refresh** buttons on the Rules table and on each mapping group.
- **Options** dropdowns: Apply-to-metrics and Apply-to-column are comboboxes populated
  from the panel data; Aggregation adds First/Last (not null), Diff and Time of last point.
- **Thresholds**: a "Base" row, a per-row "+" (add below), and an eye toggle to
  hide/disable a color/level (skipped during evaluation).
- **Mappings**: "What" is a combobox of the diagram's cell ids/labels/metadata, with a
  bull's-eye button to pick a cell directly on the diagram (hover halos the cell).
- Row controls now grow to fill the width instead of shrinking to content.
- Icon parity with the original: a **Refresh** button beside "Add flowchart"; action-icon
  order/location matched to the original (rules: trash·clone·eye·↑·↓; thresholds:
  +·eye·trash·clone, Base: +·clone; mappings: trash·eye·target·clone — the
  pick-a-cell target moved into the Actions column); glyphs mapped to Grafana's icon set.
- **Rule-row target:** a crosshair on each collapsed rule row enters pick mode and points
  all of that rule's mapping rows at the clicked diagram cell (the original's
  "change targets of all mapping").
- **Hover-to-halo:** in the editor, hovering a mapping's "What", a folded rule row, or an
  individual option in the "What" dropdown halos the matching diagram cell(s) with a solid
  thick pure-green outline (gap from the cell), cleared on mouse-leave — matching the original.
- **Wheel zoom:** Ctrl/⌘/Alt + mouse wheel zooms the diagram toward the cursor (matches
  the original; a plain wheel still scrolls the dashboard).
- **Pan:** left-drag pans the diagram view (works even when Lock is on; a plain click still
  reaches links/picks, and panning is suppressed during a cell pick).
- **Double-click zoom:** double-click a cell to zoom it to fill the view, centered;
  double-click empty space to reset/refit the whole diagram.
- **Showcase demo + default:** the provisioned demo dashboard (and a newly-added panel's
  default) now ship a multi-object synoptic with rules covering every mapping kind —
  color (fill/stroke/font), text, link, events (rotation/opacity/blink/visibility/edge-flow),
  tooltip+sparkline, thresholds (comparators/levels/Base, gradient, invert) — driven by
  random-walk metrics (flow/level/pressure/temperature/status) that refresh live.
