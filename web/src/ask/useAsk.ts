import dayjs from 'dayjs';
import { useCallback, useRef, useState } from 'react';
import { trimHistory, type AskResponse, type HistoryMessage } from '@/shared/ask';
import { useApiJson } from '../api';

const ASK_API_PATH = '/api/ask';

export interface Turn {
  id: number;
  question: string;
  status: 'pending' | 'done' | 'failed';
  answer?: AskResponse;
  error?: string;
}

/** The server keeps no conversation, so each request carries the recent exchanges that were answered. */
function buildHistory(turns: Turn[]): HistoryMessage[] {
  return trimHistory(
    turns
      .filter(
        (turn) =>
          turn.status === 'done' && turn.answer?.outcome === 'answered' && turn.answer.text.trim(),
      )
      .map((turn) => [
        { role: 'user', content: turn.question },
        { role: 'assistant', content: turn.answer!.text },
      ]),
  );
}

/**
 * Conversation state for the assistant. Requests are tracked here rather than as a mutation:
 * the app's shared mutation handler would toast "Couldn't save changes", which is wrong for a
 * question, and the error belongs in the thread.
 */
export function useAsk() {
  const send = useApiJson();
  const [turns, setTurns] = useState<Turn[]>([]);
  const nextId = useRef(1);
  const controller = useRef<AbortController | null>(null);
  const pending = turns.some((turn) => turn.status === 'pending');

  const ask = useCallback(
    async (question: string) => {
      const id = nextId.current++;
      const abort = new AbortController();
      const history = buildHistory(turns);
      const update = (change: Partial<Turn>) =>
        setTurns((current) =>
          current.map((turn) => (turn.id === id ? { ...turn, ...change } : turn)),
        );

      controller.current = abort;
      setTurns((current) => [...current, { id, question, status: 'pending' }]);

      try {
        const answer = await send<AskResponse>(ASK_API_PATH, {
          method: 'POST',
          signal: abort.signal,
          // "Today" is the viewer's own day, so "last month" means theirs.
          body: { question, today: dayjs().format('YYYY-MM-DD'), history },
        });

        update({ status: 'done', answer });
      } catch (error) {
        // Clearing the chat aborts the request; there is nothing left to update.
        if (!abort.signal.aborted) {
          update({
            status: 'failed',
            error: error instanceof Error ? error.message : 'Something went wrong',
          });
        }
      }
    },
    [send, turns],
  );

  const clear = useCallback(() => {
    controller.current?.abort();
    setTurns([]);
  }, []);

  return { turns, pending, ask, clear };
}
