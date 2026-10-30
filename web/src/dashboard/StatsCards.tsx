import {
  ColorSwatch,
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  IconActivity,
  IconArrowDownRight,
  IconArrowUpRight,
  IconChartBar,
  IconChartPie,
  IconScale,
  IconTrendingDown,
  type Icon,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef } from 'react';
import { CardTitle } from './CardTitle';
import { formatMoney, formatShort, formatSigned } from '../format';
import { type Filters, ISO_DATE, PRESETS, startOfWeek, today } from './filters';
import { useBaseCurrency } from './currency';
import { categoryIcon } from './kinds';
import type { Stats } from '../../../shared/dashboard';
import classes from './Dashboard.module.css';

function Kpi(props: {
  icon: Icon;
  color: string;
  title: string;
  value: string;
  valueColor?: string;
  sub: string;
}) {
  const { icon: Icon, color, title, value, valueColor, sub } = props;

  return (
    <Paper withBorder p="md" radius="md">
      <Group gap={8}>
        <ThemeIcon variant="light" color={color} size={28} radius="md">
          <Icon size={16} />
        </ThemeIcon>
        <Text fz="sm" c="dimmed">
          {title}
        </Text>
      </Group>
      <Text fz={22} fw={700} mt={8} c={valueColor} className={classes.num} truncate>
        {value}
      </Text>
      <Text fz="xs" c="dimmed">
        {sub}
      </Text>
    </Paper>
  );
}

const sumOf = <T,>(items: T[] | undefined, pick: (item: T) => number) =>
  items?.reduce((sum, item) => sum + pick(item), 0) ?? 0;

type Day = Stats['days'][number];

/** Sums one field of a day's rows, optionally of one kind only. */
const onDay = (stats: Stats | undefined, date: string, pick: (day: Day) => number, kind?: string) =>
  sumOf(
    stats?.days.filter((day) => day.date === date && (!kind || day.kind === kind)),
    pick,
  );

const total = (day: Day) => day.total;

const periodExpense = (stats: Stats | undefined) => sumOf(stats?.flow, (bucket) => bucket.expense);

export function KpiCards({ stats, filters }: { stats: Stats | undefined; filters: Filters }) {
  const base = useBaseCurrency();
  const now = today();
  const yesterday = dayjs().subtract(1, 'day').format(ISO_DATE);
  const spentToday = -onDay(stats, now, total, 'expense');
  const spentYesterday = -onDay(stats, yesterday, total, 'expense');
  const earnedToday = onDay(stats, now, total, 'income');
  const countToday = onDay(stats, now, (day) => day.count);

  const expense = periodExpense(stats);
  const income = sumOf(stats?.flow, (bucket) => bucket.income);
  const net = income - expense;
  const firstDay = filters.from ?? stats?.flow[0]?.bucket;
  const days = firstDay ? Math.max(1, dayjs(filters.to ?? now).diff(firstDay, 'day') + 1) : 1;
  const period = PRESETS.find((preset) => preset.value === filters.preset)?.label ?? 'Custom';
  const change = spentToday - spentYesterday;

  return (
    <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }}>
      <Kpi
        icon={IconArrowDownRight}
        color="red"
        title="Spent today"
        value={formatMoney(spentToday, base)}
        valueColor="red"
        sub={`${change >= 0 ? '▲' : '▼'} ${formatMoney(change, base)} vs yesterday`}
      />
      <Kpi
        icon={IconArrowUpRight}
        color="brand"
        title="Earned today"
        value={formatMoney(earnedToday, base)}
        valueColor="brand"
        sub={`${countToday} transactions today`}
      />
      <Kpi
        icon={IconTrendingDown}
        color="red"
        title={`Expenses · ${period}`}
        value={formatMoney(expense, base)}
        sub={`≈ ${formatMoney(Math.round(expense / days / 100) * 100, base)} / day`}
      />
      <Kpi
        icon={IconScale}
        color="brand"
        title={`Net · ${period}`}
        value={formatSigned(net, base)}
        valueColor={net < 0 ? 'red' : 'brand'}
        sub={`${formatMoney(income, base)} in · ${formatMoney(expense, base)} out`}
      />
    </SimpleGrid>
  );
}

/** Every bucket in the range, including empty ones, so bars sit at their real positions. */
function fillBuckets(stats: Stats, filters: Filters) {
  const byKey = new Map(stats.flow.map((bucket) => [bucket.bucket, bucket]));
  const unit = stats.bucket === 'month' ? 'month' : 'day';
  const format = unit === 'month' ? 'YYYY-MM' : ISO_DATE;
  const first = filters.from ?? stats.flow[0]?.bucket;
  const last = filters.to ?? stats.flow.at(-1)?.bucket;

  if (!first || !last) {
    return [];
  }

  const buckets = [];

  for (
    let date = dayjs(first).startOf(unit);
    !date.isAfter(dayjs(last));
    date = date.add(1, unit)
  ) {
    const key = date.format(format);

    buckets.push(byKey.get(key) ?? { bucket: key, expense: 0, income: 0 });
  }

  return buckets;
}

export function DailyFlowChart({ stats, filters }: { stats: Stats | undefined; filters: Filters }) {
  const base = useBaseCurrency();
  const buckets = stats ? fillBuckets(stats, filters) : [];
  // Income sits on top of expense, so the tallest stack sets the scale.
  const max = Math.max(1, ...buckets.map((bucket) => bucket.expense + bucket.income));
  const legend = (
    <Group gap="md">
      {[
        ['Expense', 'var(--mantine-color-red-filled)'],
        ['Income', 'var(--mantine-color-brand-filled)'],
      ].map(([label, color]) => (
        <Group key={label} gap={5}>
          <ColorSwatch size={8} radius={2} color={color} withShadow={false} />
          <Text fz="xs" c="dimmed">
            {label}
          </Text>
        </Group>
      ))}
    </Group>
  );

  return (
    <Paper withBorder p="md" radius="md">
      <CardTitle icon={IconChartBar} right={legend}>
        {stats?.bucket === 'month' ? 'Monthly flow' : 'Daily flow'}
      </CardTitle>
      <div className={classes.bars}>
        {buckets.map((bucket) => (
          <Tooltip
            key={bucket.bucket}
            label={
              <>
                <div>{bucket.bucket}</div>
                <div>Expense: {formatMoney(bucket.expense, base)}</div>
                <div>Income: {formatMoney(bucket.income, base)}</div>
              </>
            }
          >
            <div className={classes.bar}>
              <i className={classes.income} style={{ height: `${(bucket.income / max) * 100}%` }} />
              <i
                className={classes.expense}
                style={{ height: `${(bucket.expense / max) * 100}%` }}
              />
            </div>
          </Tooltip>
        ))}
      </div>
      <Group justify="space-between" mt="xs">
        <Text fz={11} c="dimmed">
          {buckets[0]?.bucket}
        </Text>
        <Text fz={11} c="dimmed">
          peak {formatShort(max)}
        </Text>
        <Text fz={11} c="dimmed">
          {buckets.at(-1)?.bucket}
        </Text>
      </Group>
    </Paper>
  );
}

export function TopCategories({
  stats,
  onSelect,
}: {
  stats: Stats | undefined;
  onSelect: (category: string) => void;
}) {
  const base = useBaseCurrency();
  const categories = stats?.categories ?? [];
  // Shares are of all spending in the period, not just of the categories listed.
  const spent = periodExpense(stats) || 1;
  const top = categories[0]?.expense || 1;

  return (
    <Paper withBorder p="md" radius="md">
      <CardTitle icon={IconChartPie}>Top categories</CardTitle>
      {categories.length === 0 && (
        <Text c="dimmed" ta="center" py="xl" fz="sm">
          No expenses in this period
        </Text>
      )}
      <Stack gap="sm">
        {categories.map(({ category, expense }) => {
          const Icon = categoryIcon(category);

          return (
            <UnstyledButton key={category} onClick={() => onSelect(category)}>
              <Group gap="sm" wrap="nowrap">
                <ThemeIcon variant="light" color="red" size={28} radius="md">
                  <Icon size={16} />
                </ThemeIcon>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Text fz="sm" fw={500} truncate>
                      {category}{' '}
                      <Text span c="dimmed" fz="sm">
                        {Math.round((expense / spent) * 100)}%
                      </Text>
                    </Text>
                    <Text fz="sm" fw={600} className={classes.num}>
                      {formatMoney(expense, base)}
                    </Text>
                  </Group>
                  <Progress value={(expense / top) * 100} size={5} mt={4} />
                </div>
              </Group>
            </UnstyledButton>
          );
        })}
      </Stack>
    </Paper>
  );
}

const HEAT_DAYS = 365;

export function ActivityHeatmap(props: {
  stats: Stats | undefined;
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const base = useBaseCurrency();
  const { stats, selected, onSelect } = props;
  const heatmap = stats?.heatmap;
  const scroller = useRef<HTMLDivElement>(null);

  // On narrow cards the grid scrolls; start at the most recent weeks.
  useEffect(() => {
    if (scroller.current) {
      scroller.current.scrollLeft = scroller.current.scrollWidth;
    }
  }, [heatmap]);

  // ~370 cells: rebuild them only when the data, selection or currency change.
  const cells = useMemo(() => {
    const byDate = new Map(heatmap?.map((day) => [day.date, day.expense]));
    const sorted = [...byDate.values()].sort((left, right) => left - right);
    const quantile = (share: number) => sorted[Math.floor(sorted.length * share)] ?? 0;
    const thresholds = [quantile(0.25), quantile(0.5), quantile(0.8)];
    // 0 for no spending, then 1-4 by how many thresholds the day's spending exceeds.
    const level = (value: number) =>
      value ? 1 + thresholds.filter((threshold) => value > threshold).length : 0;

    // Start on a Monday so each column is one week.
    const end = dayjs();
    const result = [];

    for (
      let date = startOfWeek(end.subtract(HEAT_DAYS - 1, 'day'));
      !date.isAfter(end, 'day');
      date = date.add(1, 'day')
    ) {
      const key = date.format(ISO_DATE);
      const value = byDate.get(key) ?? 0;

      result.push(
        <button
          key={key}
          type="button"
          className={classes.cell}
          data-level={level(value)}
          data-selected={key === selected || undefined}
          title={`${date.format('ddd, D MMM YYYY')} · ${formatMoney(value, base)}`}
          onClick={() => onSelect(key)}
        />,
      );
    }

    return result;
  }, [heatmap, selected, base, onSelect]);

  return (
    <Paper withBorder p="md" radius="md">
      <CardTitle
        icon={IconActivity}
        right={
          <Text fz="xs" c="dimmed">
            spending per day
          </Text>
        }
      >
        Activity · last 12 months
      </CardTitle>
      <div className={classes.heatWrap} ref={scroller}>
        <div className={classes.heat}>{cells}</div>
      </div>
      <Group gap={3} justify="flex-end" mt="xs">
        <Text fz={11} c="dimmed" mr={4}>
          Less
        </Text>
        {[0, 1, 2, 3, 4].map((value) => (
          <span
            key={value}
            className={classes.cell}
            data-level={value}
            style={{ cursor: 'default' }}
          />
        ))}
        <Text fz={11} c="dimmed" ml={4}>
          More
        </Text>
      </Group>
    </Paper>
  );
}
