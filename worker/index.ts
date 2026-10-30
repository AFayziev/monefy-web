import { Hono } from 'hono';
import { handleImportQueue } from './queue';
import { dashboard } from './routes/dashboard';
import { me } from './routes/me';
import { webhook } from './routes/webhook';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (context) => context.json({ ok: true }));
app.route('/api/me', me);
app.route('/api/webhook', webhook);
app.route('/api/dashboard', dashboard);

export default {
  fetch: app.fetch,
  queue: handleImportQueue,
} satisfies ExportedHandler<Env, unknown>;
