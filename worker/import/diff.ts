import type { StoredRow } from '../db';
import { FIELD_SEPARATOR, type Transaction } from './parse';

export interface ImportPlan {
  /** New rows, or rows that reappeared after a soft delete (upserted). */
  insert: Transaction[];
  /** Edited rows: same date/account/category, different amount or description. */
  update: { oldKey: string; transaction: Transaction }[];
  /** Existing rows whose transfer pairing changed. */
  relink: { rowKey: string; transferId: string | null }[];
  /** Live keys no longer present in the file. */
  remove: string[];
}

const groupKey = (date: string, account: string, category: string) =>
  [date, account, category].join(FIELD_SEPARATOR);

export function diff(parsed: Transaction[], stored: StoredRow[]): ImportPlan {
  const storedByKey = new Map(stored.map((row) => [row.row_key, row]));
  const parsedKeys = new Set(parsed.map((transaction) => transaction.rowKey));

  const fresh: Transaction[] = []; // not in the table at all
  const insert: Transaction[] = [];
  const relink: ImportPlan['relink'] = [];

  for (const transaction of parsed) {
    const row = storedByKey.get(transaction.rowKey);

    if (!row) {
      fresh.push(transaction);
    } else if (row.deleted_at) {
      // Reappeared after a soft delete: restore it.
      insert.push(transaction);
    } else if (row.transfer_id !== transaction.transferId) {
      relink.push({ rowKey: transaction.rowKey, transferId: transaction.transferId });
    }
  }

  const removed = stored.filter(
    (storedRow) => !storedRow.deleted_at && !parsedKeys.has(storedRow.row_key),
  );

  // An edit shows up as one removed row plus one fresh row with the same date/account/category.
  const removedBy = new Map<string, StoredRow[]>();

  for (const storedRow of removed) {
    const group = groupKey(storedRow.date, storedRow.account, storedRow.category);

    (removedBy.get(group) ?? removedBy.set(group, []).get(group)!).push(storedRow);
  }

  const freshBy = new Map<string, Transaction[]>();

  for (const transaction of fresh) {
    const group = groupKey(transaction.date, transaction.account, transaction.category);

    (freshBy.get(group) ?? freshBy.set(group, []).get(group)!).push(transaction);
  }

  const update: ImportPlan['update'] = [];
  const updatedOld = new Set<string>();
  const updatedNew = new Set<string>();

  for (const [group, removedRows] of removedBy) {
    const freshRows = freshBy.get(group);

    if (removedRows.length === 1 && freshRows?.length === 1) {
      update.push({ oldKey: removedRows[0].row_key, transaction: freshRows[0] });
      updatedOld.add(removedRows[0].row_key);
      updatedNew.add(freshRows[0].rowKey);
    }
  }

  return {
    insert: [...insert, ...fresh.filter((transaction) => !updatedNew.has(transaction.rowKey))],
    update,
    relink,
    remove: removed
      .filter((storedRow) => !updatedOld.has(storedRow.row_key))
      .map((storedRow) => storedRow.row_key),
  };
}
