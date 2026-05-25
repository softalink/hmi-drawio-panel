import { test, expect } from '@grafana/plugin-e2e';

test('renders the draw.io diagram for a fresh panel', async ({ panelEditPage, page }) => {
  await panelEditPage.setVisualization('HMI draw.io');
  // The default diagram renders into the diagram container as inline SVG.
  const diagram = page.getByTestId('hmi-diagram');
  await expect(diagram).toBeVisible();
  await expect(diagram.locator('svg')).toBeVisible();
});
