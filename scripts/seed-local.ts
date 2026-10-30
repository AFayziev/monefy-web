// Imports a Monefy CSV export into the local D1 database: `npx tsx scripts/seed-local.ts sample.csv`.
import { readFileSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';
import { createDb } from '../worker/db';
import { importCsv } from '../worker/import/run';

const path = process.argv[2];

if (!path) {
  throw new Error('usage: npx tsx scripts/seed-local.ts <export.csv>');
}

const { env, dispose } = await getPlatformProxy<Env>();
const db = createDb(env.DB);
const csv = readFileSync(path, 'utf8');
let result;

// One pass may stop early on the statement budget; keep going until the import is complete.
do {
  result = await importCsv(db, csv);
  console.log(result);
} while (result.more);

await dispose();
