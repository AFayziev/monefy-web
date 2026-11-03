import type Anthropic from '@anthropic-ai/sdk';
import type { AskOutcome } from '@/shared/ask';
import type { Db } from '../db';
import { MODEL, estimateCostUsd } from './client';
import { AskError, classifyAiError } from './errors';
import { buildSystemPrompt } from './prompt';
import { TOOLS, createToolContext, runTool } from './tools';

/** Model calls per question. A question needing more than this is stuck in a loop. */
const MAX_TURNS = 5;
/** Includes adaptive thinking, which is billed and capped as output. */
const MAX_OUTPUT_TOKENS = 4096;

/** One retry, for failures that can clear up on their own. */
const RETRY_DELAY_MS = 600;

const REFUSED_MESSAGE = "I can't help with that request.";
const TOO_LONG_MESSAGE = 'That answer got too long to finish. Try a narrower question.';
/**
 * Added to the last turn's tool results. Forcing text with `tool_choice: none` alone sometimes got a
 * thinking-only reply with no answer (1 in 3 in testing); with this note it answered every time.
 */
const FINAL_TURN_NOTE =
  'That was the last lookup you may make. Answer now using only the results above.';
const EMPTY_MESSAGE = "I couldn't come up with an answer. Try rephrasing your question.";
const STUCK_MESSAGE =
  "I couldn't reach an answer in a reasonable number of steps. Try a narrower question.";

interface ToolTrace {
  name: string;
  input: unknown;
  output: string;
  isError: boolean;
}

/** One model call, with the tools it asked for. */
interface TurnTrace {
  turn: number;
  /** The gateway's id for this request, to find it in the dashboard log. */
  logId: string | null;
  stopReason: Anthropic.StopReason | null;
  usage: { input_tokens: number; output_tokens: number };
  text: string;
  tools: ToolTrace[];
}

export interface AskResult {
  outcome: AskOutcome;
  /** What to show the user: the model's answer, or a fixed message when it didn't finish. */
  text: string;
  turns: TurnTrace[];
  usage: { input_tokens: number; output_tokens: number };
  costUsd: number;
}

interface AskOptions {
  client: Anthropic;
  db: Db;
  /** Earlier turns of the conversation, as plain user/assistant messages. */
  history?: Anthropic.MessageParam[];
  question: string;
  /** The viewer's local day, YYYY-MM-DD. */
  today: string;
  conversationId: string;
  /** The owner's private glossary of their data (AI_CONTEXT_NOTES). */
  notes?: string;
  /** Aborts the model call in flight, e.g. when the browser went away. */
  signal?: AbortSignal;
}

const textOf = (content: Anthropic.ContentBlock[]) =>
  content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

/** One model call; a transient failure gets a second try, any other becomes an AskError. */
async function callModel(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  options: { headers: Record<string, string>; signal?: AbortSignal },
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await client.messages.create(params, options).withResponse();
    } catch (error) {
      const failure = classifyAiError(error);

      if (!failure) {
        throw error;
      }

      if (failure.retryable && attempt === 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

        continue;
      }

      throw new AskError(failure);
    }
  }
}

/**
 * The tool-use loop: call the model, run the tools it asks for, send the results back, and repeat
 * until it answers. Each call carries `cf-aig-metadata` so the gateway log groups a question's
 * calls together.
 */
export async function ask(options: AskOptions): Promise<AskResult> {
  const { client, db, question, today, conversationId, notes, signal } = options;
  const toolContext = createToolContext(db);
  // Identical every turn, so built once.
  const system = buildSystemPrompt({ today, notes });
  const messages: Anthropic.MessageParam[] = [
    ...(options.history ?? []),
    { role: 'user', content: question },
  ];
  const turns: TurnTrace[] = [];
  const usage = { input_tokens: 0, output_tokens: 0 };

  const finish = (outcome: AskOutcome, text: string): AskResult => ({
    outcome,
    text,
    turns,
    usage,
    costUsd: estimateCostUsd(usage),
  });

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    if (turn === MAX_TURNS) {
      const last = messages.at(-1);

      if (last?.role === 'user' && Array.isArray(last.content)) {
        last.content = [...last.content, { type: 'text', text: FINAL_TURN_NOTE }];
      }
    }

    const { data: response, response: http } = await callModel(
      client,
      {
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        tools: TOOLS,
        // On the last turn the model must answer with what it has: a tool call now would be run
        // and then thrown away, ending the question with no answer.
        ...(turn === MAX_TURNS ? { tool_choice: { type: 'none' as const } } : {}),
        messages,
      },
      {
        headers: {
          'cf-aig-metadata': JSON.stringify({ feature: 'ask', conversation: conversationId, turn }),
        },
        signal,
      },
    );

    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;

    const trace: TurnTrace = {
      turn,
      logId: http.headers.get('cf-aig-log-id'),
      stopReason: response.stop_reason,
      usage: response.usage,
      text: textOf(response.content),
      tools: [],
    };

    turns.push(trace);

    // The whole content goes back as is, so thinking blocks stay intact.
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      // An empty answer (thinking only, say) is not one: it would also break the next request,
      // since history entries can't be empty.
      return trace.text.trim()
        ? finish('answered', trace.text)
        : finish('unexpected_stop', EMPTY_MESSAGE);
    }

    if (response.stop_reason === 'max_tokens') {
      return finish('max_tokens', TOO_LONG_MESSAGE);
    }

    if (response.stop_reason === 'refusal') {
      return finish('refused', REFUSED_MESSAGE);
    }

    if (response.stop_reason !== 'tool_use') {
      return finish('unexpected_stop', STUCK_MESSAGE);
    }

    const calls = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    const outputs = await Promise.all(
      calls.map((call) => runTool(toolContext, call.name, call.input)),
    );

    // Built after they all finish, so the trace follows the order the model asked in.
    const results = calls.map((call, index): Anthropic.ToolResultBlockParam => {
      const { content, isError } = outputs[index];

      trace.tools.push({ name: call.name, input: call.input, output: content, isError });

      return {
        type: 'tool_result',
        tool_use_id: call.id,
        content,
        ...(isError ? { is_error: true } : {}),
      };
    });

    // Every result for this turn goes back in one user message.
    messages.push({ role: 'user', content: results });
  }

  return finish('max_turns', STUCK_MESSAGE);
}
