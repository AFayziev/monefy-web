import { SignInButton } from '@clerk/react';
import { Button, Center, Stack, Text, Title } from '@mantine/core';
import Logo from '../components/Logo';

export default function Landing() {
  return (
    <Center
      mih="100vh"
      p="md"
      style={{
        background:
          'radial-gradient(ellipse 80% 70% at 50% 0%, var(--mantine-color-brand-1) 0%, var(--mantine-color-white) 100%)',
      }}
    >
      <Stack align="center" gap="lg" maw={460} ta="center">
        <Logo size={80} />
        <Title order={1} fw={700} c="gray.7">
          Monefy web viewer
        </Title>
        <Text c="dimmed" fz="lg">
          Your Monefy expenses, synced and in one place.
        </Text>
        <SignInButton mode="modal">
          <Button size="md" px="xl">
            Sign in
          </Button>
        </SignInButton>
      </Stack>
    </Center>
  );
}
