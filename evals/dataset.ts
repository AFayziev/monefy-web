// A synthetic Monefy export for the evals: made-up people, accounts and amounts, in English and
// Russian. It is generated from a fixed seed, so every run sees the same data and the expected
// answers (computed by SQL over it) stay stable. Nothing here comes from anyone's real finances.

const HEADER = 'date,account,category,amount,currency,converted amount,currency,description';

/** The export's one main currency; USD amounts convert at a flat rate. */
const BASE = 'UZS';
const USD_RATE = 12_000;

export const ACCOUNTS = { cash: 'Cash', card: 'Карта', usd: 'USD wallet' } as const;

const START = '2025-11-01';

/** The day the evals pretend it is. The data runs through it. */
export const EVAL_TODAY = '2026-11-03';

/** mulberry32: a tiny seeded PRNG, so the dataset never changes between runs. */
function seeded(seed: number) {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);

    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const random = seeded(20261103);
const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
const between = (low: number, high: number, step: number) =>
  low + Math.floor((random() * (high - low)) / step) * step;

interface Spec {
  category: string;
  /** Chance per day. */
  chance: number;
  /** Min, max and rounding step, in UZS. */
  range: [number, number, number];
  descriptions: readonly string[];
}

const EXPENSES: Spec[] = [
  {
    category: 'Groceries',
    chance: 0.7,
    range: [20_000, 220_000, 500],
    descriptions: ['Milk and bread', 'Хлеб и молоко', 'Supermarket', 'Овощи и фрукты', ''],
  },
  {
    category: 'Кафе и рестораны',
    chance: 0.3,
    range: [15_000, 180_000, 500],
    descriptions: ['Lunch', 'Кофе', 'Coffee with friends', 'Плов', 'Ужин в кафе'],
  },
  {
    category: 'Transport',
    chance: 0.45,
    range: [2_000, 15_000, 500],
    descriptions: ['Bus', 'Метро', 'Metro card top-up', ''],
  },
  {
    category: 'Такси',
    chance: 0.25,
    range: [8_000, 45_000, 500],
    descriptions: ['Yandex Go', 'Uber', 'Такси домой', ''],
  },
  {
    category: 'Здоровье',
    chance: 0.06,
    range: [20_000, 400_000, 500],
    descriptions: ['Аптека', 'Pharmacy', 'Врач', 'Dentist', 'аптека у дома'],
  },
  {
    category: 'Entertainment',
    chance: 0.08,
    range: [30_000, 250_000, 500],
    descriptions: ['Cinema tickets', 'Кино', 'Concert', 'Bowling'],
  },
  {
    category: 'Одежда',
    chance: 0.03,
    range: [100_000, 900_000, 1_000],
    descriptions: ['Джинсы', 'Jacket', 'Кроссовки', 'Gift for myself'],
  },
  {
    category: 'Gifts',
    chance: 0.03,
    range: [50_000, 500_000, 1_000],
    descriptions: ['Birthday gift', 'Цветы', 'Подарок маме'],
  },
];

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const toCsvDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** "-1 100 000": the export's thousands are spaces. */
const formatAmount = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const csvField = (value: string) =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

interface Row {
  date: string;
  account: string;
  category: string;
  /** In the account's own currency, whole units. */
  amount: number;
  description?: string;
}

const currencyOf = (account: string) => (account === ACCOUNTS.usd ? 'USD' : BASE);

function toLine(row: Row) {
  const currency = currencyOf(row.account);
  const converted = currency === BASE ? row.amount : row.amount * USD_RATE;

  return [
    toCsvDate(row.date),
    csvField(row.account),
    csvField(row.category),
    formatAmount(row.amount),
    currency,
    formatAmount(converted),
    BASE,
    csvField(row.description ?? ''),
  ].join(',');
}

/** A currency exchange as Monefy exports it: a "To" leg and a "From" leg, same day. */
const transfer = (
  date: string,
  from: string,
  to: string,
  fromAmount: number,
  toAmount: number,
): Row[] => [
  { date, account: from, category: `To '${to}'`, amount: -fromAmount },
  { date, account: to, category: `From '${from}'`, amount: toAmount },
];

export function generateExport(): string {
  const rows: Row[] = [
    {
      date: START,
      account: ACCOUNTS.cash,
      category: `Initial balance '${ACCOUNTS.cash}'`,
      amount: 2_000_000,
    },
    {
      date: START,
      account: ACCOUNTS.card,
      category: `Initial balance '${ACCOUNTS.card}'`,
      amount: 5_000_000,
    },
    {
      date: START,
      account: ACCOUNTS.usd,
      category: `Initial balance '${ACCOUNTS.usd}'`,
      amount: 400,
    },
  ];

  const end = Date.parse(EVAL_TODAY);

  for (let time = Date.parse(START); time <= end; time += 86_400_000) {
    const date = isoDate(new Date(time));
    const day = Number(date.slice(8, 10));

    for (const spec of EXPENSES) {
      if (random() < spec.chance) {
        rows.push({
          date,
          account: random() < 0.6 ? ACCOUNTS.cash : ACCOUNTS.card,
          category: spec.category,
          amount: -between(...spec.range),
          description: pick(spec.descriptions),
        });
      }
    }

    if (day === 1) {
      rows.push({
        date,
        account: ACCOUNTS.card,
        category: 'Rent',
        amount: -3_000_000,
        description: 'Monthly rent',
      });

      // Recorded as an expense, the way people log a conversion; it ends up the biggest category.
      rows.push({
        date,
        account: ACCOUNTS.cash,
        category: 'Currency exchange',
        amount: -6_000_000,
        description: 'Dollars',
      });
    }

    if (day === 5) {
      rows.push({
        date,
        account: ACCOUNTS.card,
        category: 'Salary',
        amount: 12_000_000,
        description: 'Salary',
      });
    }

    if (day === 10) {
      rows.push({
        date,
        account: ACCOUNTS.usd,
        category: 'Entertainment',
        amount: -15,
        description: 'Netflix',
      });
    }

    if (day === 20 && Number(date.slice(5, 7)) % 2 === 0) {
      rows.push({
        date,
        account: ACCOUNTS.usd,
        category: 'Фриланс',
        amount: 300,
        description: 'Design job',
      });
    }

    if (day === 15) {
      rows.push(...transfer(date, ACCOUNTS.cash, ACCOUNTS.usd, 1_200_000, 100));
    }
  }

  // Fixed rows, so "yesterday" and "today" questions have something to find.
  rows.push(
    {
      date: '2026-11-02',
      account: ACCOUNTS.cash,
      category: 'Groceries',
      amount: -45_000,
      description: 'Milk and bread',
    },
    {
      date: '2026-11-02',
      account: ACCOUNTS.card,
      category: 'Такси',
      amount: -22_000,
      description: 'Yandex Go',
    },
  );

  return [HEADER, ...rows.map(toLine)].join('\n');
}
