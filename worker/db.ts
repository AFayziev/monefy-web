import type { ImportPlan } from './import/diff';
import type { Transaction } from './import/parse';
import type {
  AccountSummary,
  CategoryTotal,
  DayTotal,
  FlowBucket,
  Overview,
  Stats,
  TransactionRow,
  TransactionsPage,
} from '../shared/dashboard';
import type { DashboardFilter } from './schemas';

/** A stored row as the importer needs it to diff against a new export. */
export interface StoredRow {
  row_key: string;
  date: string;
  account: string;
  category: string;
  transfer_id: string | null;
  deleted_at: string | null;
}

/** What one pass actually wrote. `more` is true when another pass is needed to finish. */
export interface AppliedChanges {
  inserted: number;
  updated: number;
  deleted: number;
  more: boolean;
}

export interface ImportSummary extends AppliedChanges {
  rowsTotal: number;
}

const ImportStatus = {
  running: 'running',
  /** The statement budget ran out; a follow-up pass finishes the import. */
  partial: 'partial',
  done: 'done',
  failed: 'failed',
} as const;

const DATA_VERSION_KEY = 'data_version';

/** Bumps the version dashboard responses are cached under, so the cache misses after a change. */
const BUMP_VERSION_SQL =
  `INSERT INTO settings (key, value) VALUES ('${DATA_VERSION_KEY}', '1') ` +
  `ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1`;

/** Rebuilds the summaries the dashboard overview reads; mirrors migrations/0004_summaries.sql. */
const REFRESH_SUMMARIES_SQL = [
  'DELETE FROM account_summaries',
  `INSERT INTO account_summaries
   SELECT account, currency, SUM(amount), SUM(converted_amount), COUNT(*)
   FROM transactions WHERE deleted_at IS NULL GROUP BY account, currency`,
  'DELETE FROM category_summaries',
  // Transfer and initial-balance labels are not categories worth filtering by.
  `INSERT INTO category_summaries
   SELECT category, COUNT(*) FROM transactions
   WHERE deleted_at IS NULL AND kind IN ('expense', 'income') GROUP BY category`,
  BUMP_VERSION_SQL,
];

/**
 * D1's free plan allows ~50 queries per invocation; leave room for the select, the summary
 * refresh and bookkeeping.
 */
const MAX_WRITE_STATEMENTS = 42 - REFRESH_SUMMARIES_SQL.length;

/**
 * Size of the JSON array each statement carries as its one bound parameter. D1 caps a statement
 * at about 100 KB, so this leaves room for the SQL text. Chunks are cut by size, not row count,
 * because descriptions are free text. Typical rows are ~125 bytes, so 15k rows fit in ~32 chunks.
 */
const MAX_PARAMETER_BYTES = 60_000;

/** Column order of a transaction row, which is also the order of `toRowArray`. */
const COLUMNS = [
  'row_key',
  'date',
  'account',
  'category',
  'kind',
  'counter_account',
  'transfer_id',
  'amount',
  'currency',
  'converted_amount',
  'converted_currency',
  'description',
  'search_text',
];

/**
 * Lowercased text the search matches against. SQLite's LIKE and lower() only fold ASCII, so
 * Cyrillic descriptions are folded here, in JavaScript, at import time.
 */
const searchText = (transaction: Transaction) => transaction.description.toLowerCase();

/** Rows go in as positional JSON arrays rather than objects to keep the parameter small. */
const toRowArray = (transaction: Transaction) => [
  transaction.rowKey,
  transaction.date,
  transaction.account,
  transaction.category,
  transaction.kind,
  transaction.counterAccount,
  transaction.transferId,
  transaction.amount,
  transaction.currency,
  transaction.convertedAmount,
  transaction.convertedCurrency,
  transaction.description,
  searchText(transaction),
];

interface JsonChunk {
  json: string;
  itemCount: number;
}

/** Serializes items into JSON arrays that each stay under `MAX_PARAMETER_BYTES`. */
function toJsonChunks(items: unknown[]): JsonChunk[] {
  const encoder = new TextEncoder();
  const chunks: JsonChunk[] = [];
  let parts: string[] = [];
  let bytes = 0;

  const flush = () => {
    chunks.push({ json: `[${parts.join(',')}]`, itemCount: parts.length });
    parts = [];
    bytes = 0;
  };

  for (const item of items) {
    const json = JSON.stringify(item);
    const itemBytes = encoder.encode(json).length + 1; // +1 for the comma

    if (parts.length && bytes + itemBytes > MAX_PARAMETER_BYTES) {
      flush();
    }

    parts.push(json);
    bytes += itemBytes;
  }

  if (parts.length) {
    flush();
  }

  return chunks;
}

type StatementKind = 'insert' | 'update' | 'relink' | 'remove';

interface PlanStatement {
  kind: StatementKind;
  /** How many rows (or keys) this statement carries. */
  itemCount: number;
  statement: D1PreparedStatement;
}

function buildPlanStatements(d1: D1Database, plan: ImportPlan): PlanStatement[] {
  const statements: PlanStatement[] = [];
  const add = (kind: StatementKind, sql: string, items: unknown[]) => {
    for (const { json, itemCount } of toJsonChunks(items)) {
      statements.push({ kind, itemCount, statement: d1.prepare(sql).bind(json) });
    }
  };

  // Upsert so a row that reappears after a soft delete is restored.
  const insertSql =
    `INSERT INTO transactions (${COLUMNS.join(', ')}) ` +
    `SELECT ${COLUMNS.map((_, index) => `j.value->>${index}`).join(', ')} FROM json_each(?1) j WHERE true ` +
    `ON CONFLICT(row_key) DO UPDATE SET deleted_at = NULL, transfer_id = excluded.transfer_id, ` +
    `search_text = excluded.search_text`;

  add('insert', insertSql, plan.insert.map(toRowArray));

  // Each update item is [oldKey, ...row].
  const assignments = COLUMNS.map((column, index) => `${column} = j.value->>${index + 1}`).join(
    ', ',
  );
  const updateSql =
    `UPDATE transactions SET ${assignments}, deleted_at = NULL FROM json_each(?1) j ` +
    `WHERE transactions.row_key = j.value->>0`;

  add(
    'update',
    updateSql,
    plan.update.map((change) => [change.oldKey, ...toRowArray(change.transaction)]),
  );

  const relinkSql =
    `UPDATE transactions SET transfer_id = j.value->>1 FROM json_each(?1) j ` +
    `WHERE transactions.row_key = j.value->>0`;

  add(
    'relink',
    relinkSql,
    plan.relink.map((link) => [link.rowKey, link.transferId]),
  );

  const softDeleteSql =
    `UPDATE transactions SET deleted_at = datetime('now') ` +
    `WHERE row_key IN (SELECT value FROM json_each(?1))`;

  add('remove', softDeleteSql, plan.remove);

  return statements;
}

// --- Dashboard reads ----------------------------------------------------------------------------

const PAGE_SIZE = 50;
const TOP_CATEGORIES = 8;
const HEATMAP_DAYS = 365;
/** Longer ranges are charted by month instead of by day. */
const MAX_DAILY_BUCKETS = 62;
const DAY_MS = 86_400_000;

const DEFAULT_ACCOUNT_KEY = 'default_account';
/** Used only while the database is empty. */
const DEFAULT_BASE_CURRENCY = 'UZS';

const addDays = (isoDate: string, days: number) =>
  new Date(Date.parse(isoDate) + days * DAY_MS).toISOString().slice(0, 10);

const daysBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;

interface Where {
  sql: string;
  params: (string | number)[];
}

/** WHERE clause for the dashboard filters; `alias` qualifies columns when the query joins. */
function buildWhere(filter: DashboardFilter, alias = ''): Where {
  const column = (name: string) => (alias ? `${alias}.${name}` : name);
  const conditions = [`${column('deleted_at')} IS NULL`];
  const params: (string | number)[] = [];
  const add = (sql: string, ...values: (string | number)[]) => {
    conditions.push(sql);
    params.push(...values);
  };

  if (filter.from) {
    add(`${column('date')} >= ?`, filter.from);
  }

  if (filter.to) {
    add(`${column('date')} <= ?`, filter.to);
  }

  if (filter.account) {
    add(`${column('account')} = ?`, filter.account);
  }

  if (filter.category) {
    add(`${column('category')} = ?`, filter.category);
  }

  if (filter.kind === 'transfer') {
    conditions.push(`${column('kind')} IN ('transfer_out', 'transfer_in')`);
  } else if (filter.kind) {
    add(`${column('kind')} = ?`, filter.kind);
  }

  if (filter.q) {
    // instr() rather than LIKE, so % and _ in the search are plain characters.
    add(`instr(${column('search_text')}, ?) > 0`, filter.q.toLowerCase());
  }

  return { sql: conditions.join(' AND '), params };
}

const EXPENSE_SUM = `-SUM(CASE WHEN kind = 'expense' THEN converted_amount ELSE 0 END)`;
const INCOME_SUM = `SUM(CASE WHEN kind = 'income' THEN converted_amount ELSE 0 END)`;

/** The only place that talks to D1: every query in the Worker goes through this client. */
export function createDb(d1: D1Database) {
  return {
    transactions: {
      /** Every stored row, including soft-deleted ones. */
      async listStored(): Promise<StoredRow[]> {
        const { results } = await d1
          .prepare(
            'SELECT row_key, date, account, category, transfer_id, deleted_at FROM transactions',
          )
          .all<StoredRow>();

        return results;
      },

      /**
       * Applies as much of the plan as one invocation allows and reports what was actually
       * applied; `more` says the plan didn't fit and another pass is needed.
       */
      async applyPlan(plan: ImportPlan): Promise<AppliedChanges> {
        const statements = buildPlanStatements(d1, plan);
        const statementsToRun = statements.slice(0, MAX_WRITE_STATEMENTS);
        const applied: AppliedChanges = {
          inserted: 0,
          updated: 0,
          deleted: 0,
          more: statements.length > MAX_WRITE_STATEMENTS,
        };

        // The summaries are rebuilt in the same transaction, so they never disagree with the rows.
        if (statementsToRun.length) {
          await d1.batch([
            ...statementsToRun.map(({ statement }) => statement),
            ...REFRESH_SUMMARIES_SQL.map((sql) => d1.prepare(sql)),
          ]);
        }

        for (const { kind, itemCount } of statementsToRun) {
          if (kind === 'insert') {
            applied.inserted += itemCount;
          } else if (kind === 'update') {
            applied.updated += itemCount;
          } else if (kind === 'remove') {
            applied.deleted += itemCount;
          }
        }

        return applied;
      },
    },

    dashboard: {
      /**
       * Accounts with balances, filter categories, the converted currency and the account to open
       * on, in one round trip.
       */
      async overview(): Promise<Overview> {
        const [accounts, categories, currency, starred] = await d1.batch([
          d1.prepare(
            `SELECT account, currency, balance, converted_balance AS convertedBalance, count
             FROM account_summaries ORDER BY count DESC`,
          ),
          d1.prepare('SELECT category FROM category_summaries ORDER BY count DESC'),
          // Monefy converts every row into its one main currency, so any row has it: reading one
          // row avoids scanning the whole table.
          d1.prepare(
            'SELECT converted_currency FROM transactions WHERE deleted_at IS NULL LIMIT 1',
          ),
          d1.prepare('SELECT value FROM settings WHERE key = ?1').bind(DEFAULT_ACCOUNT_KEY),
        ]);

        const summaries = accounts.results as AccountSummary[];
        const starredAccount = (starred.results[0] as { value: string } | undefined)?.value;

        return {
          accounts: summaries,
          categories: (categories.results as { category: string }[]).map((row) => row.category),
          baseCurrency:
            (currency.results[0] as { converted_currency: string } | undefined)
              ?.converted_currency ?? DEFAULT_BASE_CURRENCY,
          // A starred account can disappear after a rename in Monefy; then nothing is starred.
          defaultAccount:
            summaries.find((summary) => summary.account === starredAccount)?.account ?? null,
        };
      },

      /**
       * One page of transactions, newest first. A paired transfer is one row: without an account
       * filter only its outgoing leg is listed, carrying the other leg as `counter_*`.
       */
      async transactions(filter: DashboardFilter, offset: number): Promise<TransactionsPage> {
        const where = buildWhere(filter, 't');
        // The incoming leg is hidden only when its outgoing partner is listed instead.
        const partner = buildWhere(filter, 'c');
        const collapse = filter.account
          ? ''
          : ` AND NOT (t.kind = 'transfer_in' AND c.row_key IS NOT NULL AND ${partner.sql})`;
        const params = filter.account ? where.params : [...where.params, ...partner.params];
        const from =
          `FROM transactions t LEFT JOIN transactions c ON c.transfer_id = t.transfer_id ` +
          `AND c.row_key <> t.row_key AND c.deleted_at IS NULL WHERE ${where.sql}${collapse}`;

        const rows = d1
          .prepare(
            `SELECT t.row_key, t.date, t.account, t.category, t.kind, t.amount, t.currency,
               t.converted_amount, t.converted_currency, t.description,
               c.account AS counter_account, c.amount AS counter_amount,
               c.currency AS counter_currency
             ${from} ORDER BY t.date DESC, t.rowid DESC LIMIT ? OFFSET ?`,
          )
          .bind(...params, PAGE_SIZE, offset);

        // Later pages reuse the first page's total, so only the first one counts.
        if (offset > 0) {
          const page = await rows.all<TransactionRow>();

          return { rows: page.results, pageSize: PAGE_SIZE };
        }

        const [page, count] = await d1.batch([
          rows,
          d1.prepare(`SELECT COUNT(*) AS total ${from}`).bind(...params),
        ]);

        return {
          rows: page.results as TransactionRow[],
          total: (count.results[0] as { total: number }).total,
          pageSize: PAGE_SIZE,
        };
      },

      /**
       * Charts for the filtered range plus "today" and the activity heatmap, which ignore the
       * date range but keep the other filters.
       */
      async stats(filter: DashboardFilter, today: string): Promise<Stats> {
        const ranged = buildWhere(filter);
        const undated = buildWhere({ ...filter, from: undefined, to: undefined });
        const byMonth =
          !filter.from || !filter.to || daysBetween(filter.from, filter.to) > MAX_DAILY_BUCKETS;
        const bucket = byMonth ? 'substr(date, 1, 7)' : 'date';
        const yesterday = addDays(today, -1);

        const [flow, categories, days, heatmap] = await d1.batch([
          d1
            .prepare(
              `SELECT ${bucket} AS bucket, ${EXPENSE_SUM} AS expense, ${INCOME_SUM} AS income
               FROM transactions WHERE ${ranged.sql} GROUP BY bucket ORDER BY bucket`,
            )
            .bind(...ranged.params),
          d1
            .prepare(
              `SELECT category, -SUM(converted_amount) AS expense FROM transactions
               WHERE ${ranged.sql} AND kind = 'expense'
               GROUP BY category ORDER BY expense DESC LIMIT ?`,
            )
            .bind(...ranged.params, TOP_CATEGORIES),
          d1
            .prepare(
              `SELECT date, kind, SUM(converted_amount) AS total, COUNT(*) AS count
               FROM transactions WHERE ${undated.sql} AND date IN (?, ?) GROUP BY date, kind`,
            )
            .bind(...undated.params, today, yesterday),
          d1
            .prepare(
              `SELECT date, -SUM(converted_amount) AS expense FROM transactions
               WHERE ${undated.sql} AND kind = 'expense' AND date > ? AND date <= ?
               GROUP BY date`,
            )
            .bind(...undated.params, addDays(today, -HEATMAP_DAYS), today),
        ]);

        return {
          bucket: byMonth ? 'month' : 'day',
          flow: flow.results as FlowBucket[],
          categories: categories.results as CategoryTotal[],
          days: days.results as DayTotal[],
          heatmap: heatmap.results as { date: string; expense: number }[],
        };
      },
    },

    settings: {
      /** The version dashboard responses are cached under; it changes whenever the data does. */
      async dataVersion(): Promise<string> {
        const row = await d1
          .prepare('SELECT value FROM settings WHERE key = ?1')
          .bind(DATA_VERSION_KEY)
          .first<{ value: string }>();

        return row?.value ?? '0';
      },

      async setDefaultAccount(account: string): Promise<void> {
        await d1.batch([
          d1
            .prepare(
              'INSERT INTO settings (key, value) VALUES (?1, ?2) ' +
                'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            )
            .bind(DEFAULT_ACCOUNT_KEY, account),
          d1.prepare(BUMP_VERSION_SQL),
        ]);
      },
    },

    imports: {
      /** Records the start of an import and returns its id. */
      async start(fileId: string, fileName: string | null): Promise<number> {
        const record = await d1
          .prepare(
            'INSERT INTO imports (file_id, file_name, status) VALUES (?1, ?2, ?3) RETURNING id',
          )
          .bind(fileId, fileName, ImportStatus.running)
          .first<{ id: number }>();

        return record!.id;
      },

      async finish(importId: number, summary: ImportSummary): Promise<void> {
        await d1
          .prepare(
            `UPDATE imports SET status = ?2, finished_at = datetime('now'),
               rows_total = ?3, inserted = ?4, updated = ?5, deleted = ?6 WHERE id = ?1`,
          )
          .bind(
            importId,
            summary.more ? ImportStatus.partial : ImportStatus.done,
            summary.rowsTotal,
            summary.inserted,
            summary.updated,
            summary.deleted,
          )
          .run();
      },

      async fail(importId: number, error: unknown): Promise<void> {
        await d1
          .prepare(
            `UPDATE imports SET status = ?2, finished_at = datetime('now'), error = ?3 WHERE id = ?1`,
          )
          .bind(importId, ImportStatus.failed, String(error))
          .run();
      },
    },
  };
}

export type Db = ReturnType<typeof createDb>;
