// Shapes the dashboard API returns, shared by the Worker and the web app.

/** Kinds as the UI groups them: both transfer legs are one `transfer` kind. */
export const KIND_FILTERS = ['expense', 'income', 'transfer', 'initial'] as const;

export type KindFilter = (typeof KIND_FILTERS)[number];

export interface AccountSummary {
  account: string;
  currency: string;
  /** In the account's own currency, minor units. */
  balance: number;
  /** In the export's converted currency, minor units. */
  convertedBalance: number;
  count: number;
}

export interface TransactionRow {
  row_key: string;
  date: string;
  account: string;
  category: string;
  kind: string;
  amount: number;
  currency: string;
  converted_amount: number;
  converted_currency: string;
  description: string;
  /** The other leg of a transfer, when it was paired. */
  counter_account: string | null;
  counter_amount: number | null;
  counter_currency: string | null;
}

export interface FlowBucket {
  bucket: string;
  expense: number;
  income: number;
}

export interface CategoryTotal {
  category: string;
  expense: number;
}

export interface DayTotal {
  date: string;
  kind: string;
  total: number;
  count: number;
}

export interface Stats {
  bucket: 'day' | 'month';
  flow: FlowBucket[];
  categories: CategoryTotal[];
  days: DayTotal[];
  heatmap: { date: string; expense: number }[];
}

export interface TransactionsPage {
  rows: TransactionRow[];
  /** Only on the first page; later pages reuse it. */
  total?: number;
  pageSize: number;
}

export interface Overview {
  accounts: AccountSummary[];
  categories: string[];
  /** Null while the database is empty. */
  baseCurrency: string | null;
  /** The starred account; null when none is starred or it no longer exists. */
  defaultAccount: string | null;
}
