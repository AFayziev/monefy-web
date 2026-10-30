import { UserButton } from '@clerk/react';
import {
  ActionIcon,
  AppShell,
  Group,
  Title,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';
import Logo from '../components/Logo';
import Dashboard from '../pages/Dashboard';

function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light');

  return (
    <ActionIcon
      variant="default"
      size="lg"
      aria-label="Toggle color scheme"
      onClick={() => setColorScheme(scheme === 'dark' ? 'light' : 'dark')}
    >
      {scheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
    </ActionIcon>
  );
}

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
          <Group gap="sm">
            <ColorSchemeToggle />
            <UserButton />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main bg="var(--app-background)">
        <Dashboard />
      </AppShell.Main>
    </AppShell>
  );
}
