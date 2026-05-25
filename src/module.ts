import { PanelPlugin } from '@grafana/data';

import { HmiOptions, Flowchart, Rule } from './types';
import { HmiPanel } from './components/HmiPanel';
import { FlowchartsEditor } from './components/FlowchartsEditor';
import { RulesEditor } from './components/RulesEditor';
import { DEFAULT_EDITOR_URL, EDITOR_THEMES, defaultFlowchart, defaultRules, migrateRule } from './constants';

export const plugin = new PanelPlugin<HmiOptions>(HmiPanel)
  // Upgrade panels saved with the old single-diagram options { xml, fit, rules }
  // and/or the old simple rule shape to the current model.
  .setMigrationHandler((panel: any) => {
    const opts = panel.options || {};
    const rules = (opts.rules ?? []).map(migrateRule);
    if (Array.isArray(opts.flowcharts)) {
      return { ...opts, rules } as HmiOptions;
    }
    const fc = defaultFlowchart('Main', opts.xml);
    fc.scale = opts.fit !== false;
    return {
      editorUrl: opts.editorUrl ?? DEFAULT_EDITOR_URL,
      editorTheme: opts.editorTheme ?? 'kennedy',
      allowDrawioResources: !!opts.allowDrawioResources,
      flowcharts: [fc],
      rules,
    } as HmiOptions;
  })
  .setPanelOptions((builder) => {
    return builder
      .addTextInput({
        path: 'editorUrl',
        name: 'Editor URL',
        description: 'Address of the draw.io editor opened by "Edit diagram"',
        category: ['Global'],
        defaultValue: DEFAULT_EDITOR_URL,
      })
      .addSelect({
        path: 'editorTheme',
        name: 'Editor theme',
        category: ['Global'],
        defaultValue: 'kennedy',
        settings: { options: EDITOR_THEMES },
      })
      .addBooleanSwitch({
        path: 'allowDrawioResources',
        name: 'Allow draw.io source',
        description: 'Allow the viewer to load images/resources from draw.io',
        category: ['Global'],
        defaultValue: false,
      })
      .addCustomEditor<unknown, Flowchart[]>({
        id: 'flowcharts',
        path: 'flowcharts',
        name: 'Flowcharts',
        description: 'One or more draw.io diagrams, rendered stacked',
        category: ['Flowcharts'],
        defaultValue: [defaultFlowchart()],
        editor: FlowchartsEditor,
      })
      .addCustomEditor<unknown, Rule[]>({
        id: 'rules',
        path: 'rules',
        name: 'Coloring rules',
        description: 'Drive cell fill / stroke / font color from metric thresholds',
        category: ['Rules'],
        defaultValue: defaultRules(),
        editor: RulesEditor,
      });
  });
