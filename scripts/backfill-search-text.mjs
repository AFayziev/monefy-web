// Fills transactions.search_text for rows imported before the column existed (migration 0003).
// SQLite's lower() only folds ASCII, so the text is lowercased here, the same way the importer does.
//
//   node scripts/backfill-search-text.mjs [--remote] [--dry-run]
//
// Without --remote it targets the local database. Run the migrations first. Safe to re-run: only
// rows whose search_text is still NULL are touched.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATABASE = 'monefy';
/** D1 caps a statement at about 100 KB; leave room for the SQL around the JSON. */
const MAX_STATEMENT_BYTES = 60_000;

const args = new Set(process.argv.slice(2));
const target = args.has('--remote') ? '--remote' : '--local';
const dryRun = args.has('--dry-run');

function wrangler(...wranglerArgs) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', DATABASE, target, ...wranglerArgs],
    {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      maxBuffer: 512 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    throw new Error(`wrangler failed:\n${result.stderr || result.stdout}`);
  }

  return result.stdout;
}

/** Mirrors searchText() in worker/db.ts. */
const searchText = (row) => row.description.toLowerCase();

const sqlString = (text) => `'${text.replaceAll("'", "''")}'`;

const [{ results: rows }] = JSON.parse(
  wrangler(
    '--json',
    '--command',
    '"SELECT row_key, description FROM transactions WHERE search_text IS NULL"',
  ),
);

console.log(`${rows.length} rows without search text (${target.slice(2)})`);

if (dryRun || rows.length === 0) {
  process.exit(0);
}

// One UPDATE per chunk, each carrying [row_key, search_text] pairs as a JSON array.
const statements = [];
let chunk = [];
let bytes = 0;

const flush = () => {
  statements.push(
    `UPDATE transactions SET search_text = j.value->>1 FROM json_each(${sqlString(JSON.stringify(chunk))}) j ` +
      `WHERE transactions.row_key = j.value->>0 AND transactions.search_text IS NULL;`,
  );

  chunk = [];
  bytes = 0;
};

for (const row of rows) {
  const pair = [row.row_key, searchText(row)];
  const pairBytes = Buffer.byteLength(JSON.stringify(pair)) + 1;

  if (chunk.length && bytes + pairBytes > MAX_STATEMENT_BYTES) {
    flush();
  }

  chunk.push(pair);
  bytes += pairBytes;
}

flush();

const directory = mkdtempSync(join(tmpdir(), 'monefy-backfill-'));
const file = join(directory, 'backfill.sql');

try {
  writeFileSync(file, statements.join('\n'));
  wrangler('--file', file, '--yes');
} finally {
  rmSync(directory, { recursive: true, force: true });
}

const [{ results: remaining }] = JSON.parse(
  wrangler(
    '--json',
    '--command',
    '"SELECT COUNT(*) AS count FROM transactions WHERE search_text IS NULL"',
  ),
);

console.log(`updated in ${statements.length} statements; ${remaining[0].count} rows still missing`);
