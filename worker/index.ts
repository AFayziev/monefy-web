import { Hono } from 'hono';
import { handleImportQueue } from './queue';
import { dashboard } from './routes/dashboard';
import { me } from './routes/me';
import { webhook } from './routes/webhook';

const HTTP_INTERNAL_ERROR = 500;

const app = new Hono<{ Bindings: Env }>();

// Unhandled errors (a failed D1 write, an exceeded quota) reach the client as JSON it can show.
app.onError((error, context) => {
  console.error(
    JSON.stringify({ msg: 'request failed', path: context.req.path, error: String(error) }),
  );

  return context.json({ error: 'Something went wrong on the server' }, HTTP_INTERNAL_ERROR);
});

app.get('/api/health', (context) => context.json({ ok: true }));
app.route('/api/me', me);
app.route('/api/webhook', webhook);
app.route('/api/dashboard', dashboard);

export default {
  fetch: app.fetch,
  queue: handleImportQueue,
} satisfies ExportedHandler<Env, unknown>;
