import * as valibot from 'valibot';
import { KIND_FILTERS } from '../shared/dashboard';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NAME_LENGTH = 200;

/** A real calendar date: the shape alone would let 2026-13-45 through. */
const isRealDate = (value: string) =>
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

const isoDate = valibot.pipe(
  valibot.string(),
  valibot.regex(ISO_DATE, 'expected YYYY-MM-DD'),
  valibot.check(isRealDate, 'not a real date'),
);
const name = valibot.pipe(
  valibot.string(),
  valibot.trim(),
  valibot.minLength(1),
  valibot.maxLength(MAX_NAME_LENGTH),
);

/** Filters shared by the transaction list and the stats. */
export const DashboardFilter = valibot.object({
  from: valibot.optional(isoDate),
  to: valibot.optional(isoDate),
  account: valibot.optional(name),
  category: valibot.optional(name),
  kind: valibot.optional(valibot.picklist(KIND_FILTERS)),
  q: valibot.optional(
    valibot.pipe(valibot.string(), valibot.trim(), valibot.maxLength(MAX_NAME_LENGTH)),
  ),
});

export type DashboardFilter = valibot.InferOutput<typeof DashboardFilter>;

export const TransactionsQuery = valibot.object({
  ...DashboardFilter.entries,
  offset: valibot.optional(
    valibot.pipe(
      valibot.string(),
      valibot.regex(/^\d+$/),
      valibot.transform(Number),
      valibot.integer(),
      valibot.minValue(0),
    ),
    '0',
  ),
});

/** `today` comes from the client so "today" is the viewer's local day. */
export const StatsQuery = valibot.object({
  ...DashboardFilter.entries,
  today: isoDate,
});

export const DefaultAccountBody = valibot.object({ account: name });

/** Drive files are passed through to the queue unchanged; their shape is checked there. */
export const WebhookBody = valibot.object({ files: valibot.array(valibot.unknown()) });

export const DriveFile = valibot.object({
  id: valibot.pipe(valibot.string(), valibot.minLength(1)),
  name: valibot.optional(valibot.string()),
  mimeType: valibot.optional(valibot.string()),
});

export type DriveFile = valibot.InferOutput<typeof DriveFile>;
