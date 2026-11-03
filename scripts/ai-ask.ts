// Asks one question through the full loop and prints a trace of every turn.
// `npx tsx scripts/ai-ask.ts "what did I spend last month?" [YYYY-MM-DD]`. Spends real credit.
import { getPlatformProxy } from 'wrangler';
import { ask } from '../worker/ai/agent';
import { createClient } from '../worker/ai/client';
import { createDb } from '../worker/db';

const question = process.argv[2];

if (!question) {
  throw new Error('usage: npx tsx scripts/ai-ask.ts "<question>" [today YYYY-MM-DD]');
}

const today = process.argv[3] ?? new Date().toLocaleDateString('en-CA');
const conversationId = `script-${Date.now().toString(36)}`;
const clip = (text: string, max = 400) => (text.length > max ? `${text.slice(0, max)}...` : text);

const { env, dispose } = await getPlatformProxy<Env>();

try {
  const result = await ask({
    client: createClient(env),
    db: createDb(env.DB),
    question,
    today,
    conversationId,
    notes: env.AI_CONTEXT_NOTES,
  });

  for (const turn of result.turns) {
    console.log(`\n-- turn ${turn.turn} | ${turn.stopReason} | log ${turn.logId}`);
    console.log(`   tokens in ${turn.usage.input_tokens} / out ${turn.usage.output_tokens}`);

    if (turn.text) {
      console.log(`   model: ${clip(turn.text)}`);
    }

    for (const tool of turn.tools) {
      console.log(
        `   -> ${tool.name} ${JSON.stringify(tool.input)}${tool.isError ? ' [is_error]' : ''}`,
      );

      console.log(`     ${clip(tool.output)}`);
    }
  }

  console.log(`\n== ${result.outcome} | conversation ${conversationId}`);
  console.log(result.text);

  console.log(
    `\ntokens in ${result.usage.input_tokens} / out ${result.usage.output_tokens} | est. $${result.costUsd.toFixed(5)}`,
  );
} finally {
  await dispose();
}
