-- Payment receipt images attached to transactions. The bytes live in the private R2 bucket under
-- receipts/<id>. ON UPDATE CASCADE keeps a receipt on its transaction when an import edits the row
-- (an edit rewrites row_key). Transactions are only soft-deleted, so receipts are never orphaned.
CREATE TABLE receipts (
  id           TEXT PRIMARY KEY,
  row_key      TEXT NOT NULL REFERENCES transactions (row_key) ON UPDATE CASCADE,
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX receipts_row_key ON receipts (row_key);
