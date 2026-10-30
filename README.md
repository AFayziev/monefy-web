# Monefy web viewer

A web app to sync and view expenses from [Monefy smartphone app](https://www.monefy.com/)

## Local development

```sh
npm install
cp .env.example .env               # Environment variables read by wrangler and Vite
npm run dev                        # runs the Worker and the Vite app together
```

`npm run dev:api` and `npm run dev:web` run either one on its own.

`npm run typecheck` regenerates `worker-configuration.d.ts` (git-ignored) and checks both projects.

## Clerk

1. Create an application at [clerk.com](https://clerk.com).
2. Put the publishable and secret keys in `.env`.

## Deploy (Cloudflare, from GitHub)

1. In the Cloudflare dashboard: **Workers & Pages → Create → Import a repository**, pick this repo. Set the build command to `npm run build`; keep the default deploy command `npx wrangler deploy`.
2. Add the secrets **API_KEY**, **CLERK_SECRET_KEY** and **PUBLIC_CLERK_PUBLISHABLE_KEY** under the Worker's **Settings → Variables and Secrets**.
3. Add the build variable **PUBLIC_CLERK_PUBLISHABLE_KEY** under **Settings → Build → Variables and secrets**.

## Google Apps Script

`scripts/drive-folder-webhook.gs` reports new files in a Drive folder to the webhook.

1. Create a project at [script.google.com](https://script.google.com) and paste in the script.
2. In **Project Settings → Script Properties**, add:
   - `FOLDER` – the folder ID or its full URL
   - `WEBHOOK_URL` – `https://<worker>.workers.dev/api/webhook`
   - `API_KEY` – the same value as the Worker's `API_KEY` secret
3. Run `checkChanges` once and approve the permissions. The first run only records a starting point.
4. Add a time-driven trigger for `checkChanges` (e.g. every 5 minutes).
