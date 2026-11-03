// Shapes and limits of POST /api/ask, shared by the Worker and the web app.

export const MAX_QUESTION_CHARS = 2000;
export const MAX_HISTORY_MESSAGES = 10;
/** An answer can run longer than a question, but it is still capped. */
export const MAX_HISTORY_MESSAGE_CHARS = 8000;
export const MAX_HISTORY_TOTAL_CHARS = 24_000;

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MESSAGES_PER_EXCHANGE = 2;

const charsIn = (messages: HistoryMessage[]) =>
  messages.reduce((sum, message) => sum + message.content.length, 0);

/** The server's check: user, assistant, user, ... ending on an assistant message. */
export const isAlternating = (history: HistoryMessage[]) =>
  history.length % MESSAGES_PER_EXCHANGE === 0 &&
  history.every((message, index) => message.role === (index % 2 === 0 ? 'user' : 'assistant'));

export const isWithinTotalLimit = (history: HistoryMessage[]) =>
  charsIn(history) <= MAX_HISTORY_TOTAL_CHARS;

/**
 * The client's side of the same rules: the newest exchanges that fit the limits. An exchange is
 * dropped whole, so roles keep alternating.
 */
export function trimHistory(exchanges: HistoryMessage[][]): HistoryMessage[] {
  const recent = exchanges
    .filter((pair) => pair.every((message) => message.content.length <= MAX_HISTORY_MESSAGE_CHARS))
    .slice(-Math.floor(MAX_HISTORY_MESSAGES / MESSAGES_PER_EXCHANGE));

  while (charsIn(recent.flat()) > MAX_HISTORY_TOTAL_CHARS) {
    recent.shift();
  }

  return recent.flat();
}

export type AskOutcome = 'answered' | 'max_tokens' | 'refused' | 'max_turns' | 'unexpected_stop';

/** One lookup the assistant made. The raw query results stay on the server. */
export interface AskTool {
  name: string;
  input: unknown;
  isError: boolean;
}

export interface AskResponse {
  outcome: AskOutcome;
  text: string;
  tools: AskTool[];
  usage: { input_tokens: number; output_tokens: number };
  costUsd: number;
}
