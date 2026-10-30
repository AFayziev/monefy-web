import { Hono } from 'hono';
import { HTTP_UNAUTHORIZED, hasValidApiKey } from '../auth';

const API_KEY_HEADER = 'x-api-key';
const HTTP_BAD_REQUEST = 400;

/** Queues.sendBatch accepts at most 100 messages per call. */
const QUEUE_BATCH_LIMIT = 100;

export const webhook = new Hono<{ Bindings: Env }>();

webhook.post('/', async (context) => {
  if (!(await hasValidApiKey(context.req.header(API_KEY_HEADER), context.env.API_KEY))) {
    return context.json({ error: 'unauthorized' }, HTTP_UNAUTHORIZED);
  }

  const body = await context.req.json<{ files?: unknown[] }>().catch(() => null);

  if (!body || !Array.isArray(body.files)) {
    return context.json({ error: 'expected { files: [...] }' }, HTTP_BAD_REQUEST);
  }

  // One queue message per file, passed through exactly as the Apps Script sent it.
  for (let start = 0; start < body.files.length; start += QUEUE_BATCH_LIMIT) {
    await context.env.IMPORT_QUEUE.sendBatch(
      body.files.slice(start, start + QUEUE_BATCH_LIMIT).map((file) => ({ body: file })),
    );
  }

  console.log(JSON.stringify({ msg: 'webhook accepted', queued: body.files.length }));

  return context.json({ ok: true, queued: body.files.length });
});
