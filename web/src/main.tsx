import { ClerkProvider } from '@clerk/react';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import { Notifications, notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { brand, cssVariablesResolver, theme } from './theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
  // Every failed write gets a toast; failed reads are shown in place by the page.
  mutationCache: new MutationCache({
    onError: (error) =>
      notifications.show({ color: 'red', title: "Couldn't save changes", message: error.message }),
  }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider
      theme={theme}
      defaultColorScheme="auto"
      cssVariablesResolver={cssVariablesResolver}
    >
      <Notifications position="bottom-right" />
      <DatesProvider settings={{ firstDayOfWeek: 1 }}>
        <ClerkProvider
          publishableKey={import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY}
          appearance={{ variables: { colorPrimary: brand[8] } }}
        >
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </ClerkProvider>
      </DatesProvider>
    </MantineProvider>
  </StrictMode>,
);
