# Monefy web viewer

A web app to sync and view expenses from [Monefy smartphone app](https://www.monefy.com/)

## Local development

```sh
npm install
cp .env.example .env               # Environment variables read by wrangler and Vite
npm run db:migrate:local           # creates the local D1 database
npm run dev                        # runs the Worker and the Vite app together
```

`npm run dev:api` and `npm run dev:web` run either one on its own.

`npm run typecheck` regenerates `worker-configuration.d.ts` (git-ignored) and checks both projects. `npm run lint` and `npm run format:check` check style.

## Clerk

1. Create an application at [clerk.com](https://clerk.com).
2. Put the publishable and secret keys in `.env`.

## Google Drive access

The Worker downloads the exported CSV from Drive with a Google service account that has the Drive API enabled. Share the Drive folder with its email address as a **Viewer**, and put its JSON key, on one line, in `.env` as `GOOGLE_SERVICE_ACCOUNT`.

## Deploy (Cloudflare, from GitHub)

1. Create the database and put its `database_id` in `wrangler.jsonc`:
   ```sh
   npx wrangler d1 create monefy
   npm run db:migrate
   ```
   Run `npm run db:migrate` again whenever a new file is added to `migrations/`.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Import a repository**, pick this repo. Set the build command to `npm run build`; keep the default deploy command `npx wrangler deploy`.
3. Add the secrets **API_KEY**, **CLERK_SECRET_KEY**, **PUBLIC_CLERK_PUBLISHABLE_KEY** and **GOOGLE_SERVICE_ACCOUNT** under the Worker's **Settings → Variables and Secrets**. For the Google key, from the command line:
   ```sh
   npx wrangler secret put GOOGLE_SERVICE_ACCOUNT < path/to/key.json
   ```
4. Add the build variable **PUBLIC_CLERK_PUBLISHABLE_KEY** under **Settings → Build → Variables and secrets**.

## Google Apps Script

`scripts/drive-folder-webhook.gs` reports new files in a Drive folder to the webhook.

1. Create a project at [script.google.com](https://script.google.com) and paste in the script.
2. In **Project Settings → Script Properties**, add:
   - `FOLDER` – the folder ID or its full URL
   - `WEBHOOK_URL` – `https://<worker>.workers.dev/api/webhook`
   - `API_KEY` – the same value as the Worker's `API_KEY` secret
3. Run `checkChanges` once and approve the permissions. The first run only records a starting point.
4. Add a time-driven trigger for `checkChanges` (e.g. every 5 minutes).
