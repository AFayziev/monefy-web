import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev:api` serves the Worker on :8787; proxy API calls to it during development.
// Env comes from the repo-root .env; only variables prefixed PUBLIC_ are exposed to the browser.
export default defineConfig({
  plugins: [react()],
  envDir: '..',
  envPrefix: ['PUBLIC_'],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  // Libraries get their own chunks, so a change to app code doesn't re-download them.
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 2,
            },
            { name: 'clerk', test: /node_modules[\\/]@clerk[\\/]/, priority: 2 },
            { name: 'mantine', test: /node_modules[\\/]@mantine[\\/]/, priority: 2 },
            { name: 'vendor', test: /node_modules[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
});
