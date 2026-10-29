import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev:api` serves the Worker on :8787; proxy API calls to it during development.
// Env comes from the repo-root .env; only variables prefixed PUBLIC_ are exposed to the browser.
export default defineConfig({
  plugins: [react()],
  envDir: '..',
  envPrefix: ['PUBLIC_'],
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
