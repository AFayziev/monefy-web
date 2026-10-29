import { Hono } from 'hono';
import { handleImportQueue } from './queue';
import { me } from './routes/me';
import { webhook } from './routes/webhook';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true }));
app.route('/api/me', me);
app.route('/api/webhook', webhook);

export default {
  fetch: app.fetch,
  queue: handleImportQueue,
} satisfies ExportedHandler<Env, unknown>;
