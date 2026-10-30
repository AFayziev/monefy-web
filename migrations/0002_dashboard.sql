CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX transactions_account_date ON transactions (account, date);
CREATE INDEX transactions_category ON transactions (category);
CREATE INDEX transactions_transfer_id ON transactions (transfer_id);
