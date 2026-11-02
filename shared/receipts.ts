// Limits and shapes for receipt images, shared by the Worker and the web app.

export const MAX_RECEIPTS_PER_TRANSACTION = 5;
/** Per image, after the browser has downscaled it. */
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

/** Receipts attach to money going in or out, not to transfers or opening balances. */
export const RECEIPT_KINDS = ['expense', 'income'] as const;

export interface Receipt {
  id: string;
  contentType: string;
  size: number;
  createdAt: string;
}
