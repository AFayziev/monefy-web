import {
  ActionIcon,
  Button,
  Center,
  CloseButton,
  Indicator,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import { IconArrowRight, IconInbox, IconList, IconReceipt, IconSearch } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { Fragment, useState } from 'react';
import { formatMoney, formatSigned } from '../../format';
import { CardTitle } from './CardTitle';
import { useBaseCurrency } from '../currency';
import { today } from '../filters';
import { accountIcon, kindGroup, KINDS } from '../kinds';
import { ReceiptsModal } from './ReceiptsModal';
import type { TransactionRow } from '@/shared/dashboard';
import { RECEIPT_KINDS } from '@/shared/receipts';
import classes from '../Dashboard.module.css';

interface Props {
  rows: TransactionRow[];
  total: number;
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  search: string;
  onSearch: (q: string) => void;
  /** Signs transfers when the list is scoped to one account. */
  accountView: boolean;
}

function Row({
  row,
  accountView,
  onReceipts,
}: {
  row: TransactionRow;
  accountView: boolean;
  onReceipts: (row: TransactionRow) => void;
}) {
  const group = kindGroup(row.kind);
  const kind = KINDS[group];
  const AccountIcon = accountIcon(row.account, row.currency);
  const paired = group === 'transfer' && row.counter_account !== null;
  const outgoing = row.kind === 'transfer_out';

  let title;
  let amount;

  if (paired) {
    const [source, target] = outgoing
      ? [row.account, row.counter_account]
      : [row.counter_account, row.account];

    title = (
      <>
        {source} <IconArrowRight size={14} /> {target}
      </>
    );

    amount = (
      <>
        <Text fw={600} c={kind.color} className={classes.num}>
          {/* Across all accounts a transfer moves money without changing the total. */}
          {accountView
            ? formatSigned(row.amount, row.currency)
            : formatMoney(row.amount, row.currency)}
        </Text>
        {row.counter_currency !== row.currency && (
          <Text fz="xs" c="dimmed" className={classes.num}>
            {outgoing ? '→' : '←'}{' '}
            {formatMoney(row.counter_amount ?? 0, row.counter_currency ?? row.currency)}
          </Text>
        )}
      </>
    );
  } else {
    title = group === 'initial' ? 'Opening balance' : row.category;

    amount = (
      <>
        <Text fw={600} c={kind.color} className={classes.num}>
          {formatSigned(row.amount, row.currency)}
        </Text>
        {row.currency !== row.converted_currency && (
          <Text fz="xs" c="dimmed" className={classes.num}>
            ≈ {formatMoney(row.converted_amount, row.converted_currency)}
          </Text>
        )}
      </>
    );
  }

  return (
    <div className={classes.tx}>
      <Tooltip label={kind.label} position="left">
        <ThemeIcon variant="light" color={kind.color} size={32} radius="md">
          <kind.icon size={18} />
        </ThemeIcon>
      </Tooltip>
      <div className={classes.txMain}>
        <Text fw={500} component="div" className={classes.txTitle}>
          {title}
        </Text>
        <Text fz="xs" c="dimmed" component="div" className={classes.txMeta}>
          {/* A paired transfer already names both accounts in its title. */}
          {!paired && (
            <span className={classes.txAccount}>
              <AccountIcon size={12} /> {row.account}
            </span>
          )}
          <span className={classes.txDescription}>{row.description}</span>
        </Text>
      </div>
      <div className={classes.txAmount}>{amount}</div>
      <div className={classes.txAction}>
        {(RECEIPT_KINDS as readonly string[]).includes(row.kind) && (
          <Tooltip label={row.receipt_count ? 'View receipts' : 'Add receipt'} position="left">
            <Indicator
              label={row.receipt_count}
              disabled={row.receipt_count === 0}
              size={14}
              offset={3}
              color="brand"
            >
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Receipts"
                className={row.receipt_count ? undefined : classes.txActionIdle}
                onClick={() => onReceipts(row)}
              >
                <IconReceipt size={16} />
              </ActionIcon>
            </Indicator>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** Searches only on Enter or the search button, so typing doesn't query on every keystroke. */
function SearchBox({ search, onSearch }: { search: string; onSearch: (q: string) => void }) {
  // Keyed by `search`, so a cleared or changed search resets the draft by remounting.
  const [draft, setDraft] = useState(search);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(draft.trim());
      }}
    >
      <TextInput
        size="xs"
        w={240}
        placeholder="Search description"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        leftSection={
          search ? (
            <CloseButton size="xs" aria-label="Clear search" onClick={() => onSearch('')} />
          ) : (
            <IconSearch size={14} />
          )
        }
        rightSection={
          <ActionIcon type="submit" size="sm" variant="subtle" aria-label="Search">
            <IconArrowRight size={14} />
          </ActionIcon>
        }
      />
    </form>
  );
}

export function TransactionList(props: Props) {
  const { rows, total, loading, hasMore, loadingMore, onLoadMore, search, onSearch, accountView } =
    props;
  const base = useBaseCurrency();
  const [receiptRow, setReceiptRow] = useState<TransactionRow | null>(null);
  const days = new Map<string, TransactionRow[]>();

  for (const row of rows) {
    const day = days.get(row.date);

    if (day) {
      day.push(row);
    } else {
      days.set(row.date, [row]);
    }
  }

  return (
    <Paper withBorder p="md" radius="md" className={classes.txList}>
      <CardTitle
        icon={IconList}
        right={<SearchBox key={search} search={search} onSearch={onSearch} />}
      >
        Transactions{' '}
        <Text span fz="xs" fw={400} tt="none" lts={0}>
          {total} items
        </Text>
      </CardTitle>

      {loading && rows.length === 0 && (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      )}

      {!loading && rows.length === 0 && (
        <Stack align="center" gap={4} py="xl" c="dimmed">
          <IconInbox size={22} />
          <Text fz="sm">No transactions match these filters</Text>
        </Stack>
      )}

      {[...days].map(([date, dayRows]) => {
        const spent = dayRows
          .filter((row) => row.kind === 'expense')
          .reduce((sum, row) => sum + row.converted_amount, 0);

        return (
          <Fragment key={date}>
            <div className={classes.day}>
              <span>
                {date === today() ? 'Today · ' : ''}
                {dayjs(date).format('ddd, D MMM YYYY')}
              </span>
              <span className={classes.num}>{spent ? formatSigned(spent, base) : ''}</span>
            </div>
            {dayRows.map((row) => (
              <Row
                key={row.row_key}
                row={row}
                accountView={accountView}
                onReceipts={setReceiptRow}
              />
            ))}
          </Fragment>
        );
      })}

      {hasMore && (
        <Center mt="md">
          <Button variant="subtle" size="xs" loading={loadingMore} onClick={onLoadMore}>
            Load more ({total - rows.length})
          </Button>
        </Center>
      )}

      <ReceiptsModal
        rowKey={receiptRow?.row_key ?? null}
        title={receiptRow ? `Receipts · ${receiptRow.category}, ${receiptRow.date}` : 'Receipts'}
        onClose={() => setReceiptRow(null)}
      />
    </Paper>
  );
}
