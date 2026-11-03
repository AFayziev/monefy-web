import type { AskResult } from '../worker/ai/agent';
import { ACCOUNTS, EVAL_TODAY } from './dataset';

export type Sql = <T>(query: string, ...params: (string | number)[]) => Promise<T[]>;

export interface EvalCase {
  id: string;
  question: string;
  /** Returns what is wrong with the answer, empty when it passes. */
  grade: (answer: AskResult, sql: Sql) => Promise<string[]>;
}

// --- Grading helpers -----------------------------------------------------------------------------

/** "27,138,000.50 UZS" or "27 138 000" -> the numbers in it, separators removed. */
function numbersIn(text: string): number[] {
  const joined = text.replace(/(?<=\d)[,\s](?=\d{3}(?!\d))/g, '');

  return [...joined.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
}

/** Whole-unit amounts may be rounded to the unit; small counts must match exactly. */
const mentions = (text: string, expected: number, tolerance = expected >= 1000 ? 1 : 0.01) =>
  numbersIn(text).some((value) => Math.abs(value - expected) <= tolerance);

const expectNumber = (answer: AskResult, expected: number, label: string, tolerance?: number) =>
  mentions(answer.text, expected, tolerance)
    ? []
    : [`expected ${label} = ${expected} in the answer`];

const expectText = (answer: AskResult, pattern: RegExp, label: string) =>
  pattern.test(answer.text) ? [] : [`expected ${label} in the answer`];

/** For questions the data can't answer: any sizeable number is an invented one. */
const expectNoAmounts = (answer: AskResult) => {
  // Years are not amounts ("no data for 2019"). A made-up amount that happens to look like a year
  // would slip through, which is an acceptable gap for a check this simple.
  const isYear = (value: number) => Number.isInteger(value) && value >= 1900 && value <= 2100;
  const invented = numbersIn(answer.text).filter((value) => value >= 1000 && !isYear(value));

  return invented.length
    ? [`quoted amounts for data that doesn't exist: ${invented.join(', ')}`]
    : [];
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const first = async <T>(sql: Sql, query: string, ...params: (string | number)[]) =>
  (await sql<T>(query, ...params))[0];

/** Expenses are stored negative; sums come back as positive major units. */
const spent = async (sql: Sql, where: string, ...params: (string | number)[]): Promise<number> => {
  const row = await first<{ total: number | null }>(
    sql,
    `SELECT -SUM(converted_amount) / 100.0 AS total FROM transactions
     WHERE deleted_at IS NULL AND kind = 'expense' AND ${where}`,
    ...params,
  );

  return row?.total ?? 0;
};

/** Text search folded in JavaScript, like the importer does, so it doesn't lean on the SQL under test. */
async function spentOnText(sql: Sql, needle: string) {
  const rows = await sql<{ description: string; converted_amount: number }>(
    `SELECT description, converted_amount FROM transactions WHERE deleted_at IS NULL AND kind = 'expense'`,
  );

  return (
    -rows
      .filter((row) => row.description.toLowerCase().includes(needle))
      .reduce((sum, row) => sum + row.converted_amount, 0) / 100
  );
}

/** Says the exchange isn't ordinary spending: between own accounts, not real, a conversion... */
const FLAGS_EXCHANGE =
  /between (?:your|my|the) (?:own )?accounts|not (?:\w+ ){0,2}(?:real|actual|ordinary|true|genuine) (?:spending|expenses?)|isn['\u2019]t (?:\w+ ){0,2}(?:real|actual|ordinary) (?:spending|expenses?)|conversion|currenc(?:y|ies) (?:was )?(?:moved|converted)|inflat|skew|distort|transfer/i;
const DECLINES = /can['\u2019]?t|cannot|can only|only (?:answer|help)|unable|not able|outside/i;
const MAX_DECLINE_CHARS = 300;

const OCTOBER = ['2026-10-01', '2026-10-31'] as const;
const SEPTEMBER = ['2026-09-01', '2026-09-30'] as const;

// --- The cases -------------------------------------------------------------------------------------
// Today is EVAL_TODAY. Each case targets one behavior; the id says which.

export const CASES: EvalCase[] = [
  {
    id: 'total-last-month',
    question: 'How much did I spend last month?',
    grade: async (answer, sql) =>
      expectNumber(answer, await spent(sql, 'date BETWEEN ? AND ?', ...OCTOBER), 'October total'),
  },
  {
    id: 'top-category-last-month',
    question: 'What was my biggest spending category last month, and how much was it?',
    grade: async (answer, sql) => {
      const top = await first<{ category: string; total: number }>(
        sql,
        `SELECT category, -SUM(converted_amount) / 100.0 AS total FROM transactions
         WHERE deleted_at IS NULL AND kind = 'expense' AND date BETWEEN ? AND ?
         GROUP BY category ORDER BY total DESC LIMIT 1`,
        ...OCTOBER,
      );

      return [
        ...expectText(answer, new RegExp(top.category, 'i'), `category "${top.category}"`),
        ...expectNumber(answer, top.total, 'its amount'),
      ];
    },
  },
  {
    id: 'category-in-month',
    question: 'How much did I spend on Groceries in September 2026?',
    grade: async (answer, sql) =>
      expectNumber(
        answer,
        await spent(sql, `category = 'Groceries' AND date BETWEEN ? AND ?`, ...SEPTEMBER),
        'September groceries',
      ),
  },
  {
    id: 'income-this-year',
    question: 'How much have I earned so far this year?',
    grade: async (answer, sql) => {
      const row = await first<{ total: number }>(
        sql,
        `SELECT SUM(converted_amount) / 100.0 AS total FROM transactions
         WHERE deleted_at IS NULL AND kind = 'income' AND date BETWEEN '2026-01-01' AND ?`,
        EVAL_TODAY,
      );

      return expectNumber(answer, row.total, 'income in 2026');
    },
  },
  {
    id: 'peak-month',
    question: 'Which month of 2026 did I spend the most, and how much was it?',
    grade: async (answer, sql) => {
      const top = await first<{ month: string; total: number }>(
        sql,
        `SELECT substr(date, 1, 7) AS month, -SUM(converted_amount) / 100.0 AS total FROM transactions
         WHERE deleted_at IS NULL AND kind = 'expense' AND date BETWEEN '2026-01-01' AND ?
         GROUP BY month ORDER BY total DESC LIMIT 1`,
        EVAL_TODAY,
      );
      const name = MONTHS[Number(top.month.slice(5)) - 1];

      return [
        ...expectText(answer, new RegExp(`${name}|${top.month}`, 'i'), `month ${name}`),
        ...expectNumber(answer, top.total, 'total for that month'),
      ];
    },
  },
  {
    id: 'account-balance',
    question: 'What is the balance of my USD wallet?',
    grade: async (answer, sql) => {
      const row = await first<{ balance: number }>(
        sql,
        `SELECT SUM(amount) / 100.0 AS balance FROM transactions WHERE deleted_at IS NULL AND account = ?`,
        ACCOUNTS.usd,
      );

      return expectNumber(answer, row.balance, 'USD wallet balance');
    },
  },
  {
    id: 'account-spend-own-currency',
    question: 'How much did I spend from my USD wallet in 2026, in dollars?',
    grade: async (answer, sql) => {
      const row = await first<{ total: number }>(
        sql,
        `SELECT -SUM(amount) / 100.0 AS total FROM transactions
         WHERE deleted_at IS NULL AND kind = 'expense' AND account = ? AND date BETWEEN '2026-01-01' AND ?`,
        ACCOUNTS.usd,
        EVAL_TODAY,
      );

      return expectNumber(answer, row.total, 'USD wallet spend');
    },
  },
  {
    id: 'text-search-russian-case',
    question: 'How much have I spent in total on аптека?',
    grade: async (answer, sql) =>
      expectNumber(
        answer,
        await spentOnText(sql, 'аптека'),
        'total for descriptions with "аптека"',
      ),
  },
  {
    id: 'text-search-english',
    question: 'How much did I spend on cinema, all time?',
    grade: async (answer, sql) =>
      expectNumber(
        answer,
        await spentOnText(sql, 'cinema'),
        'total for descriptions with "cinema"',
      ),
  },
  {
    id: 'largest-expense',
    question: 'What was my single largest expense ever, and how much was it?',
    grade: async (answer, sql) => {
      const row = await first<{ total: number }>(
        sql,
        `SELECT -MIN(converted_amount) / 100.0 AS total FROM transactions
         WHERE deleted_at IS NULL AND kind = 'expense'`,
      );

      return expectNumber(answer, row.total, 'largest expense');
    },
  },
  {
    id: 'count-transactions',
    question: 'How many expense transactions did I have in October 2026?',
    grade: async (answer, sql) => {
      const row = await first<{ count: number }>(
        sql,
        `SELECT COUNT(*) AS count FROM transactions
         WHERE deleted_at IS NULL AND kind = 'expense' AND date BETWEEN ? AND ?`,
        ...OCTOBER,
      );

      return expectNumber(answer, row.count, 'expense count');
    },
  },
  {
    id: 'yesterday',
    question: 'How much did I spend yesterday?',
    grade: async (answer, sql) =>
      expectNumber(answer, await spent(sql, 'date = ?', '2026-11-02'), 'spending on 2026-11-02'),
  },
  {
    id: 'compare-months',
    question: 'Did I spend more in September or October 2026? Give both totals.',
    grade: async (answer, sql) => [
      ...expectNumber(
        answer,
        await spent(sql, 'date BETWEEN ? AND ?', ...SEPTEMBER),
        'September total',
      ),
      ...expectNumber(
        answer,
        await spent(sql, 'date BETWEEN ? AND ?', ...OCTOBER),
        'October total',
      ),
    ],
  },
  {
    id: 'russian-question',
    question: 'Сколько я потратил в категории Такси в октябре 2026?',
    grade: async (answer, sql) => [
      ...expectNumber(
        answer,
        await spent(sql, `category = 'Такси' AND date BETWEEN ? AND ?`, ...OCTOBER),
        'October taxi spend',
      ),
      ...expectText(answer, /[а-яё]{3,}/i, 'a Russian reply'),
    ],
  },
  {
    id: 'exchange-flagged',
    question: 'Where did most of my money go this year?',
    grade: async (answer) => [
      ...expectText(answer, /exchange/i, 'the "Currency exchange" category'),
      // Naming the category isn't enough: the answer must say it is not ordinary spending.
      ...expectText(answer, FLAGS_EXCHANGE, 'a note that the exchange is not real spending'),
    ],
  },
  {
    id: 'unknown-category',
    question: 'How much did I spend on Pets in 2026?',
    grade: async (answer) => expectNoAmounts(answer),
  },
  {
    id: 'no-data-period',
    question: 'How much did I spend in 2019?',
    grade: async (answer) => expectNoAmounts(answer),
  },
  {
    id: 'off-topic',
    question: 'Write a short poem about the sea.',
    grade: async (answer) => [
      ...(answer.turns.some((turn) => turn.tools.length)
        ? ['called a tool for an off-topic request']
        : []),
      // A poem written anyway would pass a "no tools" check, so the answer must decline, briefly.
      ...expectText(answer, DECLINES, 'a decline'),
      ...(answer.text.length > MAX_DECLINE_CHARS ? ['wrote content instead of declining'] : []),
    ],
  },
];
