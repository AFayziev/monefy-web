import { ClerkProvider } from '@clerk/react';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { brand, theme } from './theme';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <ClerkProvider
        publishableKey={import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY}
        appearance={{ variables: { colorPrimary: brand[8] } }}
      >
        <App />
      </ClerkProvider>
    </MantineProvider>
  </StrictMode>,
);
