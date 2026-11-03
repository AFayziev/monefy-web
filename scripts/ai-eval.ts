// Scores the assistant on synthetic data. `npx tsx scripts/ai-eval.ts [case-id-substring]`.
// Builds a throwaway D1 under .wrangler/eval-state (your real local database is never touched),
// asks every question for real, and checks each answer against SQL. Spends real credit (~2 cents).
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';
import { CASES, type Sql } from '../evals/cases';
import { EVAL_TODAY, generateExport } from '../evals/dataset';
import { MODEL, createClient } from '../worker/ai/client';
import { ask } from '../worker/ai/agent';
import { AskError } from '../worker/ai/errors';
import { createDb } from '../worker/db';
import { importCsv } from '../worker/import/run';

const STATE_DIR = '.wrangler/eval-state';
const filter = process.argv[2];
const cases = CASES.filter((item) => !filter || item.id.includes(filter));

if (!cases.length) {
  throw new Error(`no case matches "${filter}"`);
}

// `--persist-to <dir>` stores under <dir>/v3, while getPlatformProxy uses its path as given.
// Fresh database every run, so the data is exactly what the generator wrote.
rmSync(STATE_DIR, { recursive: true, force: true });

try {
  execSync(`npx wrangler d1 migrations apply monefy --local --persist-to ${STATE_DIR}`, {
    stdio: 'pipe',
  });
} catch (error) {
  throw new Error(`migrations failed: ${(error as { stderr?: Buffer }).stderr?.toString()}`, {
    cause: error,
  });
}

const { env, dispose } = await getPlatformProxy<Env>({ persist: { path: `${STATE_DIR}/v3` } });

try {
  const db = createDb(env.DB);
  const sql: Sql = async <T>(query: string, ...params: (string | number)[]) =>
    (
      await env.DB.prepare(query)
        .bind(...params)
        .all<T>()
    ).results;

  let imported;

  do {
    imported = await importCsv(db, generateExport());
  } while (imported.more);

  const rows = (await sql<{ n: number }>('SELECT COUNT(*) AS n FROM transactions'))[0].n;
  const runId = `eval-${Date.now().toString(36)}`;
  const client = createClient(env);

  console.log(`run ${runId} | ${MODEL} | ${rows} synthetic rows | today ${EVAL_TODAY}\n`);

  let passed = 0;
  let costUsd = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  const failures: string[] = [];

  for (const item of cases) {
    // No AI_CONTEXT_NOTES here: the evals must not depend on anyone's private glossary.
    let answer;

    try {
      answer = await ask({
        client,
        db,
        question: item.question,
        today: EVAL_TODAY,
        conversationId: `${runId}:${item.id}`,
      });
    } catch (error) {
      // A limit or gateway failure fails this case, not the whole run.
      if (!(error instanceof AskError)) {
        throw error;
      }

      failures.push(item.id);
      console.log(`FAIL  ${item.id.padEnd(28)} ${error.failure.code}: ${error.failure.message}`);

      continue;
    }

    const problems =
      answer.outcome === 'answered'
        ? await item.grade(answer, sql)
        : [`did not finish: ${answer.outcome}`];
    const calls = answer.turns.flatMap((turn) => turn.tools.map((tool) => tool.name));

    costUsd += answer.costUsd;
    tokensIn += answer.usage.input_tokens;
    tokensOut += answer.usage.output_tokens;

    if (!problems.length) {
      passed++;
    } else {
      failures.push(item.id);
    }

    console.log(
      `${problems.length ? 'FAIL' : 'pass'}  ${item.id.padEnd(28)} ${String(answer.turns.length)} turns  ` +
        `${calls.length} tool calls  $${answer.costUsd.toFixed(5)}`,
    );

    for (const problem of problems) {
      console.log(`      - ${problem}`);
    }

    if (problems.length) {
      console.log(`      Q: ${item.question}`);
      console.log(`      A: ${answer.text.replace(/\s+/g, ' ').slice(0, 300)}`);
    }
  }

  console.log(
    `\nscore ${passed}/${cases.length} | tokens in ${tokensIn} / out ${tokensOut} | est. $${costUsd.toFixed(4)}`,
  );

  console.log(`gateway log: filter metadata conversation starts with "${runId}"`);

  process.exitCode = failures.length ? 1 : 0;
} finally {
  await dispose();
}
