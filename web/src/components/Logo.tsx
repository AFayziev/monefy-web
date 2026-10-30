import { Text, ThemeIcon } from '@mantine/core';

export default function Logo({ size = 40 }: { size?: number }) {
  return (
    <ThemeIcon size={size} radius="50%" variant="light" color="brand">
      <Text fw={700} fz={size * 0.5} lh={1}>
        M
      </Text>
    </ThemeIcon>
  );
}
