import { Badge, CloseButton, Group, Paper, SegmentedControl, Select } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useState } from 'react';
import { IconCalendar, IconCategory, IconWallet } from '@tabler/icons-react';
import { type Filters, PRESETS, type Preset } from './filters';
import type { KindFilter } from '../../../shared/dashboard';
import { KINDS } from './kinds';

interface Props {
  filters: Filters;
  categories: string[];
  update: (patch: Partial<Filters>) => void;
  setPreset: (preset: Preset) => void;
}

const KIND_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Out' },
  { value: 'income', label: 'In' },
  { value: 'transfer', label: 'Transfers' },
];

export function FilterBar({ filters, categories, update, setPreset }: Props) {
  // Only a half-picked range is held locally; otherwise the picker shows the active filters.
  const [draft, setDraft] = useState<[string | null, string | null] | null>(null);

  const chips = [
    filters.account && {
      key: 'account',
      icon: IconWallet,
      label: filters.account,
      clear: () => update({ account: null }),
    },
    filters.category && {
      key: 'category',
      icon: IconCategory,
      label: filters.category,
      clear: () => update({ category: null }),
    },
    filters.kind && {
      key: 'kind',
      icon: KINDS[filters.kind].icon,
      label: KINDS[filters.kind].label,
      clear: () => update({ kind: null }),
    },
  ].filter((chip) => !!chip);

  return (
    <Paper withBorder p="md" radius="md">
      <Group gap="sm" wrap="wrap">
        <SegmentedControl
          withItemsBorders={false}
          size="xs"
          value={filters.preset}
          onChange={(value) => setPreset(value as Preset)}
          data={[
            ...PRESETS,
            ...(filters.preset === 'custom' ? [{ value: 'custom', label: 'Custom' }] : []),
          ]}
        />
        <DatePickerInput
          type="range"
          size="xs"
          w={230}
          allowSingleDateInRange
          leftSection={<IconCalendar size={14} />}
          placeholder="All time"
          valueFormat="D MMM YYYY"
          value={draft ?? [filters.from, filters.to]}
          // Closing with only a start date picked drops it and shows the active range again.
          onDropdownClose={() => setDraft(null)}
          onChange={([from, to]) => {
            if (from && to) {
              setDraft(null);
              update({ preset: 'custom', from, to });
            } else {
              setDraft([from, to]);
            }
          }}
        />
        <div style={{ flex: 1 }} />
        <Select
          size="xs"
          w={200}
          placeholder="All categories"
          leftSection={<IconCategory size={14} />}
          data={categories}
          value={filters.category}
          onChange={(category) => update({ category })}
          searchable
          clearable
        />
        <SegmentedControl
          withItemsBorders={false}
          size="xs"
          value={filters.kind ?? 'all'}
          onChange={(value) => update({ kind: value === 'all' ? null : (value as KindFilter) })}
          data={KIND_OPTIONS}
        />
      </Group>

      {chips.length > 0 && (
        <Group gap={6} mt="sm">
          {chips.map(({ key, icon: Icon, label, clear }) => (
            <Badge
              key={key}
              variant="light"
              tt="none"
              leftSection={<Icon size={12} />}
              rightSection={<CloseButton size="xs" onClick={clear} aria-label={`Clear ${key}`} />}
            >
              {label}
            </Badge>
          ))}
        </Group>
      )}
    </Paper>
  );
}
