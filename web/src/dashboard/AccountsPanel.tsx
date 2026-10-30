import {
  ActionIcon,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { IconBuildingBank, IconStack2, IconStar, IconStarFilled } from '@tabler/icons-react';
import { formatBalance, formatMoney } from '../format';
import { CardTitle } from './CardTitle';
import { useBaseCurrency } from './currency';
import { accountIcon } from './kinds';
import type { AccountSummary as Account } from '../../../shared/dashboard';
import classes from './Dashboard.module.css';

interface Props {
  accounts: Account[] | undefined;
  selected: string | null;
  defaultAccount: string | null;
  onSelect: (account: string | null) => void;
  onStar: (account: string) => void;
}

export function AccountsPanel({ accounts, selected, defaultAccount, onSelect, onStar }: Props) {
  const base = useBaseCurrency();

  if (!accounts) {
    return <Skeleton h={260} radius="md" />;
  }

  const total = accounts.reduce((sum, account) => sum + account.convertedBalance, 0);
  const current = accounts.find((account) => account.account === selected);

  return (
    <Paper withBorder p="md" radius="md">
      <CardTitle icon={IconBuildingBank}>Balance</CardTitle>

      <Text fz={24} fw={700} className={classes.num}>
        {current ? formatBalance(current.balance, current.currency) : formatBalance(total, base)}
      </Text>
      <Text fz="xs" c="dimmed" mb="md">
        {current
          ? `${current.account}${
              current.currency !== base ? ` · ≈ ${formatMoney(current.convertedBalance, base)}` : ''
            }`
          : `All accounts, in ${base}`}
      </Text>

      <Stack gap={2}>
        {accounts.map((account) => {
          const Icon = accountIcon(account.account, account.currency);
          const isDefault = account.account === defaultAccount;

          return (
            <UnstyledButton
              key={account.account}
              className={classes.account}
              data-active={account.account === selected || undefined}
              onClick={() => onSelect(account.account)}
            >
              <ThemeIcon variant="light" size={32} radius="md">
                <Icon size={18} />
              </ThemeIcon>
              <div style={{ minWidth: 0, flex: 1 }}>
                <Group gap={2} wrap="nowrap">
                  <Text fz="sm" fw={500} truncate title={account.account}>
                    {account.account}
                  </Text>
                  <Tooltip label={isDefault ? 'Default account' : 'Make default'}>
                    <ActionIcon
                      component="span"
                      variant="subtle"
                      size="xs"
                      color={isDefault ? 'yellow' : 'gray'}
                      className={isDefault ? undefined : classes.starIdle}
                      onClick={(event) => {
                        event.stopPropagation();
                        onStar(account.account);
                      }}
                      aria-label="Make default account"
                    >
                      {isDefault ? <IconStarFilled size={13} /> : <IconStar size={13} />}
                    </ActionIcon>
                  </Tooltip>
                </Group>
                <Text fz="xs" c="dimmed">
                  {account.currency}
                </Text>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Text fz="sm" fw={600} className={classes.num}>
                  {formatBalance(account.balance, account.currency)}
                </Text>
                {account.currency !== base && (
                  <Text fz="xs" c="dimmed" className={classes.num}>
                    ≈ {formatMoney(account.convertedBalance, base)}
                  </Text>
                )}
              </div>
            </UnstyledButton>
          );
        })}

        <UnstyledButton
          className={classes.account}
          data-active={selected === null || undefined}
          onClick={() => onSelect(null)}
        >
          <ThemeIcon variant="light" color="gray" size={32} radius="md">
            <IconStack2 size={18} />
          </ThemeIcon>
          <Text fz="sm" fw={500}>
            All accounts
          </Text>
        </UnstyledButton>
      </Stack>
    </Paper>
  );
}
