import { ClerkProvider } from '@clerk/react';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { brand, cssVariablesResolver, theme } from './theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider
      theme={theme}
      defaultColorScheme="auto"
      cssVariablesResolver={cssVariablesResolver}
    >
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
