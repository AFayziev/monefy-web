import dayjs from 'dayjs';
import { useCallback, useState } from 'react';
import type { KindFilter } from '../../../shared/dashboard';

export const ISO_DATE = 'YYYY-MM-DD';

export const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: '30d', label: '30 days' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All' },
] as const;

export type Preset = (typeof PRESETS)[number]['value'] | 'custom';

export interface Filters {
  preset: Preset;
  /** Inclusive range; both null means all time. */
  from: string | null;
  to: string | null;
  account: string | null;
  category: string | null;
  kind: KindFilter | null;
  q: string;
}

export const today = () => dayjs().format(ISO_DATE);

/** Monday of the date's week. */
export const startOfWeek = (date: dayjs.Dayjs) => date.subtract((date.day() + 6) % 7, 'day');

export function presetRange(preset: Preset): [string | null, string | null] {
  const now = dayjs();
  const end = now.format(ISO_DATE);
  const start = (date: dayjs.Dayjs) => [date.format(ISO_DATE), end] as [string, string];

  switch (preset) {
    case 'today':
      return start(now);
    case 'week':
      return start(startOfWeek(now));
    case 'month':
      return start(now.startOf('month'));
    case '30d':
      return start(now.subtract(29, 'day'));
    case 'year':
      return start(now.startOf('year'));
    default:
      return [null, null];
  }
}

export function useFilters() {
  const [filters, setFilters] = useState<Filters>(() => {
    const [from, to] = presetRange('month');

    return { preset: 'month', from, to, account: null, category: null, kind: null, q: '' };
  });

  const update = useCallback(
    (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch })),
    [],
  );

  const setPreset = useCallback(
    (preset: Preset) => {
      const [from, to] = presetRange(preset);

      update({ preset, from, to });
    },
    [update],
  );

  return { filters, update, setPreset };
}

/** Query string for the dashboard API; empty filters are left out. */
export function toQuery(filters: Filters, extra: Record<string, string | number> = {}): string {
  const params = new URLSearchParams();
  const values: Record<string, string | number | null> = {
    from: filters.from,
    to: filters.to,
    account: filters.account,
    category: filters.category,
    kind: filters.kind,
    q: filters.q.trim() || null,
    ...extra,
  };

  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== '') {
      params.set(key, String(value));
    }
  }

  return params.toString();
}
