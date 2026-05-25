# Test environment provisioning

These files give a reviewer (and CI) a working environment with **no manual setup** —
`docker compose up` from the repo root loads everything below automatically. See the
[Provide a test environment](https://grafana.com/developers/plugin-tools/publish-a-plugin/provide-test-environment)
and [Provision dashboards and data sources](https://grafana.com/tutorials/provision-dashboards-and-data-sources/)
docs.

- `datasources/datasources.yml` — a **TestData** datasource
  (`grafana-testdata-datasource`, uid `trlxrdZVk`, set as default) that supplies seed data
  for the demo dashboard.
- `dashboards/default.yaml` — a file provider that loads every dashboard JSON in this
  `dashboards/` directory.
- `dashboards/dashboard.json` — the **HMI demo dashboard**: a process synoptic
  (pump → tank → valve → sensor + alarm) whose cells are recolored / animated / labelled /
  linked by the plugin's rules, driven by live random-walk metrics
  (flow / level / pressure / temperature / status). Each cell carries an annotation
  describing the rule and mappings configured for it.

The datasource `uid` here matches the `datasource.uid` used by the dashboard's panel
targets, so the dashboard binds to real data on first load.
