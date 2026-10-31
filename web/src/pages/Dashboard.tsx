import { Alert, Button, SimpleGrid, Stack } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { AccountsPanel } from '../dashboard/AccountsPanel';
import { BaseCurrencyContext } from '../dashboard/currency';
import { FilterBar } from '../dashboard/FilterBar';
import { useFilters } from '../dashboard/filters';
import { useOverview, useSetDefaultAccount, useStats, useTransactions } from '../dashboard/queries';
import { ActivityHeatmap, DailyFlowChart, KpiCards, TopCategories } from '../dashboard/StatsCards';
import { TransactionList } from '../dashboard/TransactionList';
import classes from '../dashboard/Dashboard.module.css';

export default function Dashboard() {
  const { filters, update, setPreset } = useFilters();
  const [accountChosen, setAccountChosen] = useState(false);
  const overview = useOverview();
  const setDefaultAccount = useSetDefaultAccount();

  // Open on the starred account, or the busiest one when none is starred or it no longer exists.
  useEffect(() => {
    const data = overview.data;

    if (accountChosen || !data) {
      return;
    }

    update({ account: data.defaultAccount ?? data.accounts[0]?.account ?? null });
    setAccountChosen(true);
  }, [overview.data, accountChosen, update]);

  // Stable, so the heatmap's memoized cells survive unrelated re-renders.
  const selectDay = useCallback(
    (date: string) => update({ preset: 'custom', from: date, to: date }),
    [update],
  );

  const stats = useStats(filters, accountChosen);
  const transactions = useTransactions(filters, accountChosen);
  const rows = transactions.data?.pages.flatMap((page) => page.rows) ?? [];
  const failed = [overview, stats, transactions].filter((query) => query.isError);
  const baseCurrency = overview.data?.baseCurrency ?? null;
  // Stats for one account are summed in its own currency, not converted.
  const statsCurrency =
    overview.data?.accounts.find((account) => account.account === filters.account)?.currency ??
    baseCurrency;

  return (
    <BaseCurrencyContext.Provider value={baseCurrency}>
      <div className={classes.layout}>
        <AccountsPanel
          accounts={overview.data?.accounts}
          selected={filters.account}
          defaultAccount={overview.data?.defaultAccount ?? null}
          onSelect={(account) => update({ account })}
          onStar={(account) => setDefaultAccount.mutate(account)}
        />

        <Stack style={{ minWidth: 0 }}>
          {failed.length > 0 && (
            <Alert
              color="red"
              variant="light"
              icon={<IconAlertTriangle size={16} />}
              title="Couldn't load your data"
            >
              Check your connection and try again.
              <Button
                size="xs"
                variant="light"
                color="red"
                mt="sm"
                display="block"
                onClick={() => failed.forEach((query) => query.refetch())}
              >
                Retry
              </Button>
            </Alert>
          )}
          <FilterBar
            filters={filters}
            categories={overview.data?.categories ?? []}
            update={update}
            setPreset={setPreset}
          />
          <BaseCurrencyContext.Provider value={statsCurrency}>
            <KpiCards stats={stats.data} filters={filters} />
            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              <DailyFlowChart stats={stats.data} filters={filters} />
              <TopCategories stats={stats.data} onSelect={(category) => update({ category })} />
            </SimpleGrid>
            <ActivityHeatmap
              stats={stats.data}
              selected={filters.from && filters.from === filters.to ? filters.from : null}
              onSelect={selectDay}
            />
          </BaseCurrencyContext.Provider>
          <TransactionList
            rows={rows}
            total={transactions.data?.pages[0]?.total ?? 0}
            loading={transactions.isFetching && !transactions.isFetchingNextPage}
            hasMore={!!transactions.hasNextPage}
            loadingMore={transactions.isFetchingNextPage}
            onLoadMore={() => transactions.fetchNextPage()}
            search={filters.q}
            onSearch={(query) => update({ q: query })}
            accountView={filters.account !== null}
          />
        </Stack>
      </div>
    </BaseCurrencyContext.Provider>
  );
}
