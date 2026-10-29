import { UserButton } from '@clerk/react';
import { AppShell, Group, Title } from '@mantine/core';
import Logo from '../components/Logo';

export default function AppLayout() {
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Logo size={32} />
            <Title order={4} c="brand.8">
              Monefy web viewer
            </Title>
          </Group>
          <UserButton />
        </Group>
      </AppShell.Header>
      <AppShell.Main />
    </AppShell>
  );
}
