import { Group, Text } from '@mantine/core';
import type { Icon } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import classes from './Dashboard.module.css';

/** Small uppercase card heading with an icon and an optional right-aligned slot. */
export function CardTitle({
  icon: Icon,
  children,
  right,
}: {
  icon: Icon;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <Group gap={6} mb="sm">
      <Icon size={14} className={classes.dim} />
      <Text className={classes.label}>{children}</Text>
      {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
    </Group>
  );
}
