# Monefy web viewer

A web app to sync and view expenses from [Monefy smartphone app](https://www.monefy.com/)

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars    # sets API_KEY
npm run build                      # wrangler needs web/dist to exist
npm run dev:api                    # Worker on http://localhost:8787
npm run dev:web                    # Vite on http://localhost:5173, proxies /api to the Worker
```

`npm run typecheck` regenerates `worker-configuration.d.ts` (git-ignored) and checks both projects.

## Deploy (Cloudflare, from GitHub)

1. Create the queue once (`npx wrangler login` first): `npx wrangler queues create monefy-imports`
2. In the Cloudflare dashboard: **Workers & Pages → Create → Import a repository**, pick this repo. Set the build command to `npm run build`; keep the default deploy command `npx wrangler deploy`.
3. Add the secret **API_KEY** under the Worker's **Settings → Variables and Secrets**.

## Google Apps Script

`scripts/drive-folder-webhook.gs` reports new files in a Drive folder to the webhook.

1. Create a project at [script.google.com](https://script.google.com) and paste in the script.
2. In **Project Settings → Script Properties**, add:
   - `FOLDER` – the folder ID or its full URL
   - `WEBHOOK_URL` – `https://<worker>.workers.dev/api/webhook`
   - `API_KEY` – the same value as the Worker's `API_KEY` secret
3. Run `checkChanges` once and approve the permissions. The first run only records a starting point.
4. Add a time-driven trigger for `checkChanges` (e.g. every 5 minutes).
