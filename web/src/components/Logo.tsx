import { ThemeIcon } from '@mantine/core';
import { IconWallet } from '@tabler/icons-react';

/** Wallet on a rounded brand square; web/public/favicon.svg draws the same mark. */
export default function Logo({ size = 40 }: { size?: number }) {
  return (
    <ThemeIcon size={size} radius={size / 4} variant="filled" color="brand">
      <IconWallet size={size * 0.6} />
    </ThemeIcon>
  );
}
