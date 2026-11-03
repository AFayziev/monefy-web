import * as valibot from 'valibot';
import {
  MAX_HISTORY_MESSAGE_CHARS,
  MAX_HISTORY_MESSAGES,
  isAlternating,
  isWithinTotalLimit,
  MAX_QUESTION_CHARS,
} from '@/shared/ask';
import { KIND_FILTERS } from '@/shared/dashboard';

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

const HistoryMessage = valibot.object({
  role: valibot.picklist(['user', 'assistant']),
  content: valibot.pipe(
    valibot.string(),
    valibot.trim(),
    valibot.minLength(1),
    valibot.maxLength(MAX_HISTORY_MESSAGE_CHARS),
  ),
});

/** The client sends the conversation so far: the Worker keeps no conversation state. */
export const AskBody = valibot.pipe(
  valibot.object({
    question: valibot.pipe(
      valibot.string(),
      valibot.trim(),
      valibot.minLength(1),
      valibot.maxLength(MAX_QUESTION_CHARS),
    ),
    /** The viewer's local day, so "last month" means theirs. */
    today: isoDate,
    history: valibot.optional(
      valibot.pipe(valibot.array(HistoryMessage), valibot.maxLength(MAX_HISTORY_MESSAGES)),
      [],
    ),
  }),
  valibot.forward(
    valibot.check(({ history }) => isWithinTotalLimit(history), 'history is too long'),
    ['history'],
  ),
  // The new question follows the history, so it must start with a user turn and end on an answer.
  valibot.forward(
    valibot.check(
      ({ history }) => isAlternating(history),
      'history must alternate user and assistant, starting with the user',
    ),
    ['history'],
  ),
);

export type AskBody = valibot.InferOutput<typeof AskBody>;

/** Drive files are passed through to the queue unchanged; their shape is checked there. */
export const WebhookBody = valibot.object({ files: valibot.array(valibot.unknown()) });

export const DriveFile = valibot.object({
  id: valibot.pipe(valibot.string(), valibot.minLength(1)),
  name: valibot.optional(valibot.string()),
  mimeType: valibot.optional(valibot.string()),
});

export type DriveFile = valibot.InferOutput<typeof DriveFile>;

/** Row keys are `<base36 hash>-<ordinal>`. */
export const RowKeyParam = valibot.object({
  rowKey: valibot.pipe(valibot.string(), valibot.regex(/^[0-9a-z]+-\d+$/, 'invalid row key')),
});

export const ReceiptIdParam = valibot.object({
  id: valibot.pipe(valibot.string(), valibot.uuid()),
});
