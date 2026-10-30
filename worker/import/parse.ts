export type TransactionKind = 'expense' | 'income' | 'initial' | 'transfer_out' | 'transfer_in';

/** The file's content is malformed. Retrying the same file can't succeed. */
export class CsvFormatError extends Error {}

export interface Transaction {
  rowKey: string;
  date: string;
  account: string;
  category: string;
  kind: TransactionKind;
  counterAccount: string | null;
  transferId: string | null;
  amount: number;
  currency: string;
  convertedAmount: number;
  convertedCurrency: string;
  description: string;
}

// --- CSV syntax ---------------------------------------------------------------------------------

const BYTE_ORDER_MARK = 0xfeff;
const QUOTE = '"';
const DELIMITER = ',';
const LINE_FEED = '\n';
const CARRIAGE_RETURN = '\r';

// --- Monefy export layout -----------------------------------------------------------------------

/** Column positions. The header repeats `currency`, so columns are mapped by position, not name. */
const COLUMN = {
  date: 0,
  account: 1,
  category: 2,
  amount: 3,
  currency: 4,
  convertedAmount: 5,
  convertedCurrency: 6,
  description: 7,
} as const;

const COLUMN_COUNT = Object.keys(COLUMN).length;
const HEADER_ROW_COUNT = 1;
/** Line numbers shown in errors are 1-based. */
const LINE_NUMBER_OFFSET = 1;

/** Amounts are stored in minor units (cents); the export has up to three decimals. */
const MINOR_UNITS_PER_MAJOR = 100;
/** Thousands separators in the export are spaces, including non-breaking ones. */
const WHITESPACE = /\s/g;
/** A signed number with an optional decimal part, separated by a dot or a comma. */
const AMOUNT_PATTERN = /^-?\d+([.,]\d+)?$/;
const DECIMAL_COMMA = ',';
/** DD/MM/YYYY, captured as day, month, year. */
const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** Monefy writes transfers and the opening balance as the category text. */
const INITIAL_BALANCE_PATTERN = /^Initial balance '(.+)'$/;
const TRANSFER_OUT_PATTERN = /^To '(.+)'$/;
const TRANSFER_IN_PATTERN = /^From '(.+)'$/;

// --- Row identity -------------------------------------------------------------------------------

/** Joins the fields that make up a row's identity. Control character, so it can't occur in data. */
export const FIELD_SEPARATOR = '\u0001';
const ROW_KEY_SEPARATOR = '-';
const TRANSFER_PAIR_SEPARATOR = '|';

/** Parameters of cyrb53, a fast synchronous 53-bit string hash. */
const CYRB53 = {
  seedA: 0xdeadbeef,
  seedB: 0x41c6ce57,
  multiplierA: 2654435761,
  multiplierB: 1597334677,
  mixA: 2246822507,
  mixB: 3266489909,
  /** Keeps the low 21 bits of the second half so the result fits in 53 bits. */
  highBitsMask: 2097151,
  /** 2^32, the size of the first half. */
  lowHalfRange: 4294967296,
  radix: 36,
} as const;

/** Quote-aware CSV parser: handles a BOM, `""` escapes, and CRLF or LF line ends. */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === BYTE_ORDER_MARK) {
    text = text.slice(1);
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char !== QUOTE) {
        field += char;
      } else if (text[i + 1] === QUOTE) {
        field += QUOTE;
        i++;
      } else {
        quoted = false;
      }
    } else if (char === QUOTE) {
      quoted = true;
    } else if (char === DELIMITER) {
      row.push(field);
      field = '';
    } else if (char === LINE_FEED || char === CARRIAGE_RETURN) {
      if (char === CARRIAGE_RETURN && text[i + 1] === LINE_FEED) {
        i++;
      }

      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * "1 234,50" or "-1 100 000" -> integer minor units (x100). Converted amounts can carry more than
 * two decimals (e.g. "59.896"); those are rounded to the nearest cent.
 */
export function parseAmount(raw: string): number {
  const digits = raw.replace(WHITESPACE, '');

  if (!AMOUNT_PATTERN.test(digits)) {
    throw new CsvFormatError(`bad amount: ${JSON.stringify(raw)}`);
  }

  return Math.round(Number(digits.replace(DECIMAL_COMMA, '.')) * MINOR_UNITS_PER_MAJOR);
}

/** DD/MM/YYYY -> YYYY-MM-DD */
export function parseDate(raw: string): string {
  const match = DATE_PATTERN.exec(raw.trim());

  if (!match) {
    throw new CsvFormatError(`bad date: ${JSON.stringify(raw)}`);
  }

  const [, day, month, year] = match;

  return `${year}-${month}-${day}`;
}

function cyrb53(text: string): string {
  let hashA: number = CYRB53.seedA;
  let hashB: number = CYRB53.seedB;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);

    hashA = Math.imul(hashA ^ code, CYRB53.multiplierA);
    hashB = Math.imul(hashB ^ code, CYRB53.multiplierB);
  }

  hashA =
    Math.imul(hashA ^ (hashA >>> 16), CYRB53.mixA) ^ Math.imul(hashB ^ (hashB >>> 13), CYRB53.mixB);

  hashB =
    Math.imul(hashB ^ (hashB >>> 16), CYRB53.mixA) ^ Math.imul(hashA ^ (hashA >>> 13), CYRB53.mixB);

  const combined = CYRB53.lowHalfRange * (CYRB53.highBitsMask & hashB) + (hashA >>> 0);

  return combined.toString(CYRB53.radix);
}

function classify(
  category: string,
  amount: number,
): { kind: TransactionKind; counter: string | null } {
  if (INITIAL_BALANCE_PATTERN.test(category)) {
    return { kind: 'initial', counter: null };
  }

  const transferOut = TRANSFER_OUT_PATTERN.exec(category);

  if (transferOut) {
    return { kind: 'transfer_out', counter: transferOut[1] };
  }

  const transferIn = TRANSFER_IN_PATTERN.exec(category);

  if (transferIn) {
    return { kind: 'transfer_in', counter: transferIn[1] };
  }

  return { kind: amount < 0 ? 'expense' : 'income', counter: null };
}

export interface ParseResult {
  rows: Transaction[];
  unpairedTransfers: Transaction[];
}

export function parseExport(text: string): ParseResult {
  const records = parseCsv(text);
  const rows: Transaction[] = [];
  /** How many times each identical row has been seen, to tell apart exact duplicates. */
  const occurrences = new Map<string, number>();

  for (let i = HEADER_ROW_COUNT; i < records.length; i++) {
    const record = records[i];

    if (record.length === 1 && record[0] === '') {
      continue;
    }

    if (record.length < COLUMN_COUNT) {
      throw new CsvFormatError(
        `line ${i + LINE_NUMBER_OFFSET}: expected ${COLUMN_COUNT} columns, got ${record.length}`,
      );
    }

    try {
      const date = parseDate(record[COLUMN.date]);
      const amount = parseAmount(record[COLUMN.amount]);
      const convertedAmount = parseAmount(record[COLUMN.convertedAmount]);
      const { kind, counter } = classify(record[COLUMN.category], amount);
      const contentHash = cyrb53(
        [
          date,
          record[COLUMN.account],
          record[COLUMN.category],
          amount,
          record[COLUMN.currency],
          convertedAmount,
          record[COLUMN.convertedCurrency],
          record[COLUMN.description],
        ].join(FIELD_SEPARATOR),
      );
      const ordinal = occurrences.get(contentHash) ?? 0;

      occurrences.set(contentHash, ordinal + 1);

      rows.push({
        rowKey: `${contentHash}${ROW_KEY_SEPARATOR}${ordinal}`,
        date,
        account: record[COLUMN.account],
        category: record[COLUMN.category],
        kind,
        counterAccount: counter,
        transferId: null,
        amount,
        currency: record[COLUMN.currency],
        convertedAmount,
        convertedCurrency: record[COLUMN.convertedCurrency],
        description: record[COLUMN.description],
      });
    } catch (error) {
      throw new CsvFormatError(`line ${i + LINE_NUMBER_OFFSET}: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }

  return { rows, unpairedTransfers: pairTransfers(rows) };
}

const transferPairKey = (date: string, from: string, to: string, convertedAmount: number) =>
  [date, from, to, Math.abs(convertedAmount)].join(TRANSFER_PAIR_SEPARATOR);

/** Link `To 'B'` legs on A with `From 'A'` legs on B (same date, opposite converted amount). */
function pairTransfers(rows: Transaction[]): Transaction[] {
  const openOutgoing = new Map<string, Transaction[]>();
  const unpaired: Transaction[] = [];

  for (const transaction of rows) {
    if (transaction.kind === 'transfer_out') {
      const pairKey = transferPairKey(
        transaction.date,
        transaction.account,
        transaction.counterAccount!,
        transaction.convertedAmount,
      );

      (openOutgoing.get(pairKey) ?? openOutgoing.set(pairKey, []).get(pairKey)!).push(transaction);
    }
  }

  for (const transaction of rows) {
    if (transaction.kind !== 'transfer_in') {
      continue;
    }

    const pairKey = transferPairKey(
      transaction.date,
      transaction.counterAccount!,
      transaction.account,
      transaction.convertedAmount,
    );
    const outgoing = openOutgoing.get(pairKey)?.shift();

    if (outgoing) {
      outgoing.transferId = transaction.transferId = outgoing.rowKey;
    } else {
      unpaired.push(transaction);
    }
  }

  for (const leftover of openOutgoing.values()) {
    unpaired.push(...leftover);
  }

  return unpaired;
}
