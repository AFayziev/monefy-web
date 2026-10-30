import type { Db, ImportSummary } from '../db';
import { diff } from './diff';
import { parseExport } from './parse';

export interface ImportResult extends ImportSummary {
  unpairedTransfers: number;
}

/** Diffs one full export against the database and applies as much of it as one invocation allows. */
export async function importCsv(db: Db, csv: string): Promise<ImportResult> {
  const { rows, unpairedTransfers } = parseExport(csv);
  const plan = diff(rows, await db.transactions.listStored());
  const applied = await db.transactions.applyPlan(plan);

  return {
    rowsTotal: rows.length,
    ...applied,
    unpairedTransfers: unpairedTransfers.length,
  };
}
