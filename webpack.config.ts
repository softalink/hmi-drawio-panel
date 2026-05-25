// Extends the managed `.config/webpack/webpack.config.ts` (which must not be edited)
// to ship the bundled draw.io viewer as a static asset under `dist/libs`.
// See https://grafana.com/developers/plugin-tools/how-to-guides/extend-configurations
import path from 'path';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import type { Configuration } from 'webpack';

import baseConfig, { type Env } from './.config/webpack/webpack.config.ts';

const config = async (env: Env): Promise<Configuration> => {
  const base = await baseConfig(env);
  base.plugins = base.plugins ?? [];
  base.plugins.push(
    new CopyWebpackPlugin({
      patterns: [{ from: path.resolve(process.cwd(), 'src/libs'), to: 'libs' }],
    })
  );
  return base;
};

export default config;
