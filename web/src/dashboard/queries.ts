import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { Overview, Stats, TransactionsPage } from '../../../shared/dashboard';
import { useApiJson } from '../api';
import { type Filters, toQuery, today } from './filters';

const BASE = '/api/dashboard';

export function useOverview() {
  const get = useApiJson();

  return useQuery({ queryKey: ['overview'], queryFn: () => get<Overview>(`${BASE}/accounts`) });
}

export function useStats(filters: Filters, enabled = true) {
  const get = useApiJson();
  const query = toQuery(filters, { today: today() });

  return useQuery({
    queryKey: ['stats', query],
    queryFn: () => get<Stats>(`${BASE}/stats?${query}`),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useTransactions(filters: Filters, enabled = true) {
  const get = useApiJson();
  const query = toQuery(filters);

  return useInfiniteQuery({
    queryKey: ['transactions', query],
    initialPageParam: 0,
    enabled,
    queryFn: ({ pageParam }) =>
      get<TransactionsPage>(`${BASE}/transactions?${toQuery(filters, { offset: pageParam })}`),
    getNextPageParam: (last, pages) => {
      const loaded = pages.length * last.pageSize;

      // Only the first page carries the total.
      return loaded < (pages[0].total ?? 0) ? loaded : undefined;
    },
    placeholderData: keepPreviousData,
  });
}

export function useSetDefaultAccount() {
  const send = useApiJson();
  const client = useQueryClient();

  return useMutation({
    mutationFn: (account: string) =>
      send(`${BASE}/settings/default-account`, { method: 'PUT', body: { account } }),
    onSuccess: (_, account) =>
      client.setQueryData<Overview>(['overview'], (overview) =>
        overview ? { ...overview, defaultAccount: account } : overview,
      ),
  });
}
