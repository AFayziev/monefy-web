CREATE TABLE transactions (
  row_key            TEXT PRIMARY KEY,
  date               TEXT NOT NULL,
  account            TEXT NOT NULL,
  category           TEXT NOT NULL,
  kind               TEXT NOT NULL,
  counter_account    TEXT,
  transfer_id        TEXT,
  amount             INTEGER NOT NULL,
  currency           TEXT NOT NULL,
  converted_amount   INTEGER NOT NULL,
  converted_currency TEXT NOT NULL,
  description        TEXT NOT NULL,
  deleted_at         TEXT,
  imported_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX transactions_date ON transactions (date);

CREATE TABLE imports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id     TEXT NOT NULL,
  file_name   TEXT,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status      TEXT NOT NULL,
  rows_total  INTEGER,
  inserted    INTEGER,
  updated     INTEGER,
  deleted     INTEGER,
  error       TEXT
);
