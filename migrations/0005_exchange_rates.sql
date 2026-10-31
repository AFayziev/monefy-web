-- Base-currency units per unit of `currency`, refreshed by the cron trigger.
CREATE TABLE exchange_rates (
  currency TEXT PRIMARY KEY,
  rate     REAL NOT NULL
);

-- The latest transaction's rate, used when no current rate is known.
ALTER TABLE account_summaries DROP COLUMN converted_balance;
ALTER TABLE account_summaries ADD COLUMN last_rate REAL;

UPDATE account_summaries SET last_rate =
  (SELECT 1.0 * latest.converted_amount / latest.amount FROM transactions latest
   WHERE latest.account = account_summaries.account
     AND latest.currency = account_summaries.currency
     AND latest.deleted_at IS NULL AND latest.amount <> 0
   ORDER BY latest.date DESC, latest.rowid DESC LIMIT 1);

INSERT INTO settings (key, value) VALUES ('data_version', '1')
ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
