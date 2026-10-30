-- Account balances and filter categories, rebuilt by each import so the dashboard doesn't scan
-- every transaction on load.
CREATE TABLE account_summaries (
  account           TEXT NOT NULL,
  currency          TEXT NOT NULL,
  balance           INTEGER NOT NULL,
  converted_balance INTEGER NOT NULL,
  count             INTEGER NOT NULL,
  PRIMARY KEY (account, currency)
);

CREATE TABLE category_summaries (
  category TEXT PRIMARY KEY,
  count    INTEGER NOT NULL
);

INSERT INTO account_summaries
SELECT account, currency, SUM(amount), SUM(converted_amount), COUNT(*)
FROM transactions WHERE deleted_at IS NULL GROUP BY account, currency;

INSERT INTO category_summaries
SELECT category, COUNT(*) FROM transactions
WHERE deleted_at IS NULL AND kind IN ('expense', 'income') GROUP BY category;

-- Bumped on every data change; dashboard responses are cached under it.
INSERT INTO settings (key, value) VALUES ('data_version', '1')
ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
