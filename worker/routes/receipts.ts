import { Hono } from 'hono';
import { MAX_RECEIPT_BYTES, MAX_RECEIPTS_PER_TRANSACTION } from '@/shared/receipts';
import { clerk, requireUser } from '../auth';
import { createDb } from '../db';
import { validate } from '../http';
import { ReceiptIdParam, RowKeyParam } from '../schemas';

const HTTP_CREATED = 201;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_LENGTH_REQUIRED = 411;
const HTTP_TOO_LARGE = 413;
const HTTP_UNSUPPORTED = 415;

/** Uploaded images never change, so browsers may keep them for good. */
const CACHE_CONTROL = 'private, max-age=31536000, immutable';

const objectKey = (id: string) => `receipts/${id}`;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

/** The real image type from the file's first bytes; the client's Content-Type is not trusted. */
function sniffImageType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }

  // RIFF....WEBP
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }

  return null;
}

export const receipts = new Hono<{ Bindings: Env }>();

receipts.use(clerk);
receipts.use(requireUser);

receipts.get('/transactions/:rowKey', validate('param', RowKeyParam), async (context) => {
  const { rowKey } = context.req.valid('param');

  return context.json(await createDb(context.env.DB).receipts.list(rowKey));
});

receipts.post('/transactions/:rowKey', validate('param', RowKeyParam), async (context) => {
  const { rowKey } = context.req.valid('param');
  const declared = Number(context.req.header('content-length'));

  if (!declared) {
    return context.json({ error: 'Content-Length required' }, HTTP_LENGTH_REQUIRED);
  }

  if (declared > MAX_RECEIPT_BYTES) {
    return context.json({ error: 'Image is too large' }, HTTP_TOO_LARGE);
  }

  const bytes = await context.req.arrayBuffer();

  // Content-Length can lie, so the body itself is checked as well.
  if (bytes.byteLength > MAX_RECEIPT_BYTES) {
    return context.json({ error: 'Image is too large' }, HTTP_TOO_LARGE);
  }

  const contentType = sniffImageType(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 16)));

  if (!contentType) {
    return context.json(
      { error: 'Only JPEG, PNG and WebP images are supported' },
      HTTP_UNSUPPORTED,
    );
  }

  const id = crypto.randomUUID();

  await context.env.RECEIPTS.put(objectKey(id), bytes, { httpMetadata: { contentType } });

  let attached: boolean;

  try {
    attached = await createDb(context.env.DB).receipts.add({
      id,
      rowKey,
      contentType,
      size: bytes.byteLength,
    });
  } catch (error) {
    // A failed D1 write must not leave an unreferenced image behind.
    await context.env.RECEIPTS.delete(objectKey(id));

    throw error;
  }

  if (!attached) {
    await context.env.RECEIPTS.delete(objectKey(id));

    return context.json(
      {
        error: `This transaction can't take more receipts (up to ${MAX_RECEIPTS_PER_TRANSACTION} on an expense or income)`,
      },
      HTTP_CONFLICT,
    );
  }

  return context.json({ id, contentType, size: bytes.byteLength }, HTTP_CREATED);
});

receipts.get('/:id', validate('param', ReceiptIdParam), async (context) => {
  const { id } = context.req.valid('param');
  const receipt = await createDb(context.env.DB).receipts.find(id);
  const object = receipt && (await context.env.RECEIPTS.get(objectKey(id)));

  if (!receipt || !object) {
    return context.json({ error: 'not found' }, HTTP_NOT_FOUND);
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': receipt.contentType,
      'Cache-Control': CACHE_CONTROL,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'Content-Length': String(object.size),
    },
  });
});

receipts.delete('/:id', validate('param', ReceiptIdParam), async (context) => {
  const { id } = context.req.valid('param');

  if (!(await createDb(context.env.DB).receipts.remove(id))) {
    return context.json({ error: 'not found' }, HTTP_NOT_FOUND);
  }

  await context.env.RECEIPTS.delete(objectKey(id));

  return context.json({ ok: true });
});
