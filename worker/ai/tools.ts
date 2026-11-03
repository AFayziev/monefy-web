import type Anthropic from '@anthropic-ai/sdk';
import * as valibot from 'valibot';
import { MINOR_UNITS_PER_MAJOR } from '@/shared/money';
import { AGGREGATE_GROUPS, AGGREGATE_SORTS, KIND_FILTERS, type Overview } from '@/shared/dashboard';
import type { Db } from '../db';
import { DashboardFilter } from '../schemas';

/** Rows `search_transactions` returns per call: enough to answer, small enough to stay cheap. */
const MAX_SEARCH_ROWS = 20;
const MAX_GROUPS = 50;
const DEFAULT_GROUPS = 10;
const MAX_DESCRIPTION_CHARS = 120;
/** Names listed when the model asks for an account or category that doesn't exist. */
const MAX_LISTED_NAMES = 60;

/** What goes back to the model in a `tool_result` block. */
interface ToolOutput {
  content: string;
  isError: boolean;
}

// --- Input schemas (the runtime check) ----------------------------------------------------------

const SEARCH_SORTS = ['newest', 'largest'] as const;

const limit = (max: number, fallback: number) =>
  valibot.optional(
    valibot.pipe(valibot.number(), valibot.integer(), valibot.minValue(1), valibot.maxValue(max)),
    fallback,
  );

const GetSpendingInput = valibot.object({
  ...valibot.omit(DashboardFilter, ['kind']).entries,
  group_by: valibot.optional(valibot.picklist(AGGREGATE_GROUPS), 'category'),
  sort_by: valibot.optional(valibot.picklist(AGGREGATE_SORTS), 'expense'),
  limit: limit(MAX_GROUPS, DEFAULT_GROUPS),
});

const SearchTransactionsInput = valibot.object({
  ...DashboardFilter.entries,
  sort: valibot.optional(valibot.picklist(SEARCH_SORTS), 'newest'),
  offset: valibot.optional(
    valibot.pipe(valibot.number(), valibot.integer(), valibot.minValue(0)),
    0,
  ),
  limit: limit(MAX_SEARCH_ROWS, MAX_SEARCH_ROWS),
});

// --- Tool definitions (what the model sees; keep in step with the schemas above) ----------------

const filterProperties = {
  from: { type: 'string', description: 'First day, inclusive, YYYY-MM-DD.' },
  to: { type: 'string', description: 'Last day, inclusive, YYYY-MM-DD.' },
  account: {
    type: 'string',
    description:
      "Exact account name from get_overview. Amounts are then in that account's own currency.",
  },
  category: { type: 'string', description: 'Exact category name from get_overview.' },
  q: {
    type: 'string',
    description: 'Case-insensitive text to find in the transaction description (any language).',
  },
} as const;

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_overview',
    description:
      'Lists the accounts (name, currency, balance), all expense/income category names, and the base currency. ' +
      'Call this first when you need exact account or category names.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_spending',
    description:
      'Totals of expenses and income, grouped by month, day, category or account, for a date range and optional filters. ' +
      'Also returns totals over all matching rows. Transfers between accounts and opening balances are not counted. ' +
      'Amounts are positive; the currency is in the result. Use this for "how much", "what share" and "compare" questions.',
    input_schema: {
      type: 'object',
      properties: {
        ...filterProperties,
        group_by: {
          type: 'string',
          enum: [...AGGREGATE_GROUPS],
          description:
            'Default category. Months and days come oldest first; the rest largest first.',
        },
        sort_by: {
          type: 'string',
          enum: [...AGGREGATE_SORTS],
          description:
            'What categories and accounts are ranked by when not all fit. Default expense; use income for questions about where income came from.',
        },
        limit: {
          type: 'integer',
          description: `Groups to return, 1-${MAX_GROUPS}, default ${DEFAULT_GROUPS}. For months and days these are the most recent ones.`,
        },
      },
    },
  },
  {
    name: 'search_transactions',
    description:
      `Lists individual transactions (at most ${MAX_SEARCH_ROWS} per call), newest or largest first. ` +
      'Use it to find specific purchases, the biggest expenses, or to look at what is behind a total. ' +
      'Unlike get_spending, amounts here are signed: expenses are negative, income positive.',
    input_schema: {
      type: 'object',
      properties: {
        ...filterProperties,
        kind: { type: 'string', enum: [...KIND_FILTERS], description: 'Omit for all kinds.' },
        sort: {
          type: 'string',
          enum: [...SEARCH_SORTS],
          description: 'Default newest. "largest" sorts by absolute amount.',
        },
        offset: {
          type: 'integer',
          description:
            'Rows to skip, to page through results. Use next_offset from the previous call.',
        },
        limit: {
          type: 'integer',
          description: `1-${MAX_SEARCH_ROWS}, default ${MAX_SEARCH_ROWS}.`,
        },
      },
    },
  },
];

// --- Result shaping ------------------------------------------------------------------------------

/** Minor units to the number a person reads. */
const toMajor = (minor: number) => Math.round(minor) / MINOR_UNITS_PER_MAJOR;

const truncate = (text: string) =>
  text.length > MAX_DESCRIPTION_CHARS ? `${text.slice(0, MAX_DESCRIPTION_CHARS)}...` : text;

const success = (value: unknown): ToolOutput => ({
  content: JSON.stringify(value),
  isError: false,
});
const failure = (message: string): ToolOutput => ({ content: message, isError: true });

const listNames = (names: string[]) =>
  names.slice(0, MAX_LISTED_NAMES).join(', ') + (names.length > MAX_LISTED_NAMES ? ', ...' : '');

/** A wrong name is the likeliest model mistake, so it gets the valid names back. */
function checkNames(
  filter: { account?: string; category?: string },
  overview: Overview,
): string | null {
  if (filter.account && !overview.accounts.some((account) => account.account === filter.account)) {
    return `Unknown account "${filter.account}". Accounts: ${listNames(overview.accounts.map((account) => account.account))}`;
  }

  if (filter.category && !overview.categories.includes(filter.category)) {
    return `Unknown category "${filter.category}". Categories: ${listNames(overview.categories)}`;
  }

  return null;
}

/** Amounts are in the account's currency when one account is filtered, else the base currency. */
function currencyFor(filter: { account?: string }, overview: Overview) {
  return filter.account
    ? overview.accounts.find((account) => account.account === filter.account)?.currency
    : overview.baseCurrency;
}

// --- Handlers ------------------------------------------------------------------------------------

/**
 * What the handlers share within one question. The overview (accounts and categories) is read at
 * most once, however many tools ask for it: it can't change mid-question, and every query counts
 * against D1's per-invocation budget.
 */
interface ToolContext {
  db: Db;
  overview: () => Promise<Overview>;
}

export function createToolContext(db: Db): ToolContext {
  let overview: Promise<Overview> | undefined;

  return {
    db,
    overview: () =>
      (overview ??= db.dashboard.overview().catch((error: unknown) => {
        // A failed read must not be remembered.
        overview = undefined;

        throw error;
      })),
  };
}

async function getOverview({ overview: loadOverview }: ToolContext) {
  const overview = await loadOverview();

  return success({
    base_currency: overview.baseCurrency,
    accounts: overview.accounts.map((account) => ({
      name: account.account,
      currency: account.currency,
      balance: toMajor(account.balance),
      balance_in_base_currency: toMajor(account.convertedBalance),
      transactions: account.count,
    })),
    categories: overview.categories,
  });
}

async function getSpending(
  { db, overview: loadOverview }: ToolContext,
  input: valibot.InferOutput<typeof GetSpendingInput>,
) {
  const { group_by: groupBy, sort_by: sortBy, limit: groups, ...filter } = input;
  const overview = await loadOverview();
  const problem = checkNames(filter, overview);

  if (problem) {
    return failure(problem);
  }

  const result = await db.dashboard.aggregate(filter, groupBy, groups, sortBy);
  const money = (row: { expense: number; income: number; count: number }) => ({
    expense: toMajor(row.expense),
    income: toMajor(row.income),
    transactions: row.count,
  });

  return success({
    currency: currencyFor(filter, overview),
    group_by: groupBy,
    groups: result.rows.map((row) => ({ [groupBy]: row.key, ...money(row) })),
    more_groups_not_shown: result.truncated,
    totals: money(result.totals),
  });
}

async function searchTransactions(
  { db, overview: loadOverview }: ToolContext,
  input: valibot.InferOutput<typeof SearchTransactionsInput>,
) {
  const { sort, offset, limit: rowLimit, ...filter } = input;
  const overview = await loadOverview();
  const problem = checkNames(filter, overview);

  if (problem) {
    return failure(problem);
  }

  // One row more than shown, to know whether there is a next page.
  const page = await db.dashboard.transactions(filter, offset, {
    order: sort === 'largest' ? 'amount' : 'date',
    limit: rowLimit + 1,
  });
  const rows = page.rows.slice(0, rowLimit);
  const currency = currencyFor(filter, overview);
  // The extra row, if it came back, means more matches exist.
  const hasMore = page.rows.length > rows.length;

  return success({
    // The total is only known for the first page.
    total_matching: page.total,
    returned: rows.length,
    has_more: hasMore,
    ...(hasMore ? { next_offset: offset + rows.length } : {}),
    // Without an account filter, rows other than the base currency show both amounts.
    base_currency: overview.baseCurrency,
    transactions: rows.map((row) => ({
      date: row.date,
      account: row.account,
      category: row.category,
      kind: row.kind,
      amount: toMajor(row.amount),
      currency: row.currency,
      ...(!filter.account && row.currency !== row.converted_currency
        ? { amount_in_base_currency: toMajor(row.converted_amount) }
        : {}),
      description: truncate(row.description),
      ...(row.counter_account ? { transfer_to_or_from: row.counter_account } : {}),
    })),
    ...(currency && filter.account ? { note: `amounts are in ${currency}` } : {}),
  });
}

/** The model's `input` is untrusted: it is checked here, and a bad call is reported back to it. */
export async function runTool(
  context: ToolContext,
  name: string,
  input: unknown,
): Promise<ToolOutput> {
  try {
    if (name === 'get_overview') {
      return await getOverview(context);
    }

    if (name === 'get_spending') {
      const parsed = valibot.safeParse(GetSpendingInput, input ?? {});

      return parsed.success
        ? await getSpending(context, parsed.output)
        : failure(`Invalid input: ${valibot.summarize(parsed.issues)}`);
    }

    if (name === 'search_transactions') {
      const parsed = valibot.safeParse(SearchTransactionsInput, input ?? {});

      return parsed.success
        ? await searchTransactions(context, parsed.output)
        : failure(`Invalid input: ${valibot.summarize(parsed.issues)}`);
    }

    return failure(`Unknown tool "${name}"`);
  } catch (error) {
    // Details stay in the Worker log; the model gets a generic failure it can't act on.
    console.error('tool failed', name, error);

    return failure('The query failed. Try again or answer without it.');
  }
}
