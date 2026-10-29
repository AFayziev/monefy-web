import { Hono } from 'hono';
import { hasValidApiKey } from '../auth';

export const webhook = new Hono<{ Bindings: Env }>();

webhook.post('/', async (c) => {
  if (!(await hasValidApiKey(c.req.header('x-api-key'), c.env.API_KEY))) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const body = await c.req.json<{ files?: unknown[] }>().catch(() => null);
  if (!body || !Array.isArray(body.files)) {
    return c.json({ error: 'expected { files: [...] }' }, 400);
  }

  // One queue message per file, passed through exactly as the Apps Script sent it.
  // sendBatch accepts at most 100 messages per call.
  for (let i = 0; i < body.files.length; i += 100) {
    await c.env.IMPORT_QUEUE.sendBatch(
      body.files.slice(i, i + 100).map((file) => ({ body: file })),
    );
  }
  console.log(JSON.stringify({ msg: 'webhook accepted', queued: body.files.length }));
  return c.json({ ok: true, queued: body.files.length });
});
