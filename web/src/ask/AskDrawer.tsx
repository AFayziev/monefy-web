import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAlertTriangle,
  IconArrowUp,
  IconMessageCircleQuestion,
  IconTrash,
} from '@tabler/icons-react';
import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MAX_QUESTION_CHARS, type AskTool } from '@/shared/ask';
import { useAsk, type Turn } from './useAsk';

const SUGGESTIONS = [
  'How much did I spend last month?',
  'What are my biggest spending categories this year?',
  'Compare this month with the previous one',
  'What was my largest expense this year?',
];

/** What each tool is called in the thread. */
const TOOL_LABELS: Record<string, string> = {
  get_overview: 'Accounts & categories',
  get_spending: 'Spending totals',
  search_transactions: 'Transactions',
};

function toolDetail({ input }: AskTool) {
  const { from, to, category, account, q } = (input ?? {}) as Record<string, string | undefined>;
  const range = from || to ? `${from ?? '…'} → ${to ?? '…'}` : null;

  return [range, category, account, q && `“${q}”`].filter(Boolean).join(' · ');
}

function ToolChips({ tools }: { tools: AskTool[] }) {
  if (!tools.length) {
    return null;
  }

  return (
    <Group gap={6}>
      {tools.map((tool, index) => {
        const detail = toolDetail(tool);

        return (
          <Tooltip
            key={index}
            multiline
            maw={320}
            label={<code>{JSON.stringify(tool.input)}</code>}
            withArrow
            // Focusable below, so the details are reachable without a mouse.
            events={{ hover: true, focus: true, touch: true }}
          >
            <Badge
              tabIndex={0}
              variant="light"
              size="sm"
              color={tool.isError ? 'red' : 'gray'}
              tt="none"
              fw={500}
            >
              {TOOL_LABELS[tool.name] ?? tool.name}
              {detail && ` · ${detail}`}
            </Badge>
          </Tooltip>
        );
      })}
    </Group>
  );
}

const formatCost = (usd: number) => `~$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(3)}`;

// Memoized: typing in the box re-renders the drawer, but a turn's object only changes when it does.
const TurnView = memo(function TurnView({ turn }: { turn: Turn }) {
  const { answer } = turn;

  return (
    <Stack gap="xs">
      <Paper bg="var(--mantine-primary-color-light)" p="xs" px="sm" radius="md" maw="85%" ml="auto">
        <Text fz="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {turn.question}
        </Text>
      </Paper>

      {turn.status === 'pending' && (
        <Group gap="xs" c="dimmed">
          <Loader size="xs" />
          <Text fz="sm">Looking through your data…</Text>
        </Group>
      )}

      {turn.status === 'failed' && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
          {turn.error}
        </Alert>
      )}

      {answer && (
        <Stack gap={6}>
          <ToolChips tools={answer.tools} />
          <Text fz="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {answer.text}
          </Text>
          <Text fz="xs" c="dimmed">
            {formatCost(answer.costUsd)} ·{' '}
            {(answer.usage.input_tokens + answer.usage.output_tokens).toLocaleString()} tokens
          </Text>
        </Stack>
      )}
    </Stack>
  );
});

function AskDrawer({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { turns, pending, ask, clear } = useAsk();
  const [draft, setDraft] = useState('');
  const viewport = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const canSend = draft.trim().length > 0 && !pending;

  // Keep the newest message in view as the thread grows (and when the drawer is opened).
  useEffect(() => {
    if (opened) {
      viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
    }
  }, [turns, opened]);

  const submit = (question: string) => {
    if (!question.trim() || pending) {
      return;
    }

    setDraft('');
    void ask(question.trim());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter adds a line; an IME's Enter confirms a character instead.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit(draft);
    }
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="min(100vw, 30rem)"
      title="Ask your finances"
      keepMounted
      onEnterTransitionEnd={() => input.current?.focus()}
      styles={{
        body: {
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100% - var(--drawer-header-height, 60px))',
          paddingBottom: 'var(--mantine-spacing-md)',
        },
      }}
    >
      <ScrollArea flex={1} viewportRef={viewport} type="auto" offsetScrollbars>
        {turns.length === 0 ? (
          <Stack gap="xs" pt="xs">
            <Text fz="sm" c="dimmed">
              Ask about your spending in plain language. Answers come from your own data.
            </Text>
            {SUGGESTIONS.map((suggestion) => (
              <Button
                key={suggestion}
                variant="default"
                size="sm"
                justify="flex-start"
                fw={400}
                onClick={() => submit(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </Stack>
        ) : (
          // A live region, so a screen reader announces each answer as it arrives.
          <Stack gap="lg" pb="xs" role="log" aria-live="polite" aria-label="Conversation">
            {turns.map((turn) => (
              <TurnView key={turn.id} turn={turn} />
            ))}
          </Stack>
        )}
      </ScrollArea>

      <Stack gap={6} pt="sm">
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <Textarea
            ref={input}
            flex={1}
            autosize
            minRows={1}
            maxRows={5}
            maxLength={MAX_QUESTION_CHARS}
            placeholder="Ask a question…"
            aria-label="Your question"
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={onKeyDown}
          />
          <ActionIcon
            size={36}
            radius="xl"
            aria-label="Send question"
            disabled={!canSend}
            loading={pending}
            onClick={() => submit(draft)}
          >
            <IconArrowUp size={18} />
          </ActionIcon>
        </Group>
        <Group justify="space-between">
          <Text fz="xs" c="dimmed">
            AI can make mistakes. Check numbers that matter.
          </Text>
          {turns.length > 0 && (
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={<IconTrash size={12} />}
              onClick={clear}
            >
              New chat
            </Button>
          )}
        </Group>
      </Stack>
    </Drawer>
  );
}

/** The header button and the drawer it opens. The chat lives here, so closing the drawer keeps it. */
export function AskLauncher() {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Button
        variant="light"
        leftSection={<IconMessageCircleQuestion size={18} />}
        onClick={open}
        visibleFrom="xs"
      >
        Ask
      </Button>
      <ActionIcon
        variant="light"
        size="lg"
        aria-label="Ask your finances"
        onClick={open}
        hiddenFrom="xs"
      >
        <IconMessageCircleQuestion size={18} />
      </ActionIcon>
      <AskDrawer opened={opened} onClose={close} />
    </>
  );
}
