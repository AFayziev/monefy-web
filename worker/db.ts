import type { ImportPlan } from './import/diff';
import type { Transaction } from './import/parse';

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

/** D1's free plan allows ~50 queries per invocation; leave room for the select and bookkeeping. */
const MAX_WRITE_STATEMENTS = 42;

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
];

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
    `ON CONFLICT(row_key) DO UPDATE SET deleted_at = NULL, transfer_id = excluded.transfer_id`;

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

        if (statementsToRun.length) {
          await d1.batch(statementsToRun.map(({ statement }) => statement));
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
