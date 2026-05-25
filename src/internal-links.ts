// Hook that builds the option list for an "Internal" link: all dashboards (from
// the search API) plus the left-nav app pages (from the boot nav tree), so a
// link can point at the same destinations as the left navigation pane.
import { useEffect, useState } from 'react';
import { SelectableValue } from '@grafana/data';
import { config, getBackendSrv } from '@grafana/runtime';

export interface LinkOptionGroup {
  label: string;
  options: Array<SelectableValue<string>>;
}

// Walk the boot nav tree and collect every node that points at an in-app path.
function flattenNav(nodes: any[], acc: Array<SelectableValue<string>>): void {
  for (const n of nodes || []) {
    if (typeof n?.url === 'string' && n.url.startsWith('/')) {
      acc.push({ label: n.text || n.url, value: n.url });
    }
    if (Array.isArray(n?.children)) {
      flattenNav(n.children, acc);
    }
  }
}

function dedupe(opts: Array<SelectableValue<string>>): Array<SelectableValue<string>> {
  const seen = new Set<string>();
  return opts.filter((o) => (o.value && !seen.has(o.value) ? (seen.add(o.value), true) : false));
}

export function useInternalLinkOptions(): { options: LinkOptionGroup[]; loading: boolean } {
  const [options, setOptions] = useState<LinkOptionGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const pages: Array<SelectableValue<string>> = [];
    try {
      flattenNav((config as any).bootData?.navTree || [], pages);
    } catch (e) {
      // no nav tree available (e.g. tests)
    }

    const finish = (dashboards: Array<SelectableValue<string>>) => {
      if (cancelled) {
        return;
      }
      const groups: LinkOptionGroup[] = [];
      if (dashboards.length) {
        groups.push({ label: 'Dashboards', options: dashboards });
      }
      const p = dedupe(pages);
      if (p.length) {
        groups.push({ label: 'Pages', options: p });
      }
      setOptions(groups);
      setLoading(false);
    };

    try {
      getBackendSrv()
        .get('/api/search', { type: 'dash-db', limit: 1000 })
        .then((items: any[]) =>
          finish(
            (items || []).map((it) => ({
              label: (it.folderTitle ? `${it.folderTitle} / ` : '') + it.title,
              value: it.url,
            }))
          )
        )
        .catch(() => finish([]));
    } catch (e) {
      finish([]);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return { options, loading };
}

// Find the option for a stored internal path so the Select shows its label.
export function findInternalOption(groups: LinkOptionGroup[], value: string): SelectableValue<string> | null {
  if (!value) {
    return null;
  }
  for (const g of groups) {
    const hit = g.options.find((o) => o.value === value);
    if (hit) {
      return hit;
    }
  }
  return { label: value, value };
}
