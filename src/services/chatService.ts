import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/errors';

/** Upper bound on an AI coach round trip before we surface a timeout. */
const CHAT_TIMEOUT_MS = 45_000;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class ChatError extends Error {
  /** True when the server refused because a per-user rate limit was hit. */
  readonly rateLimited: boolean;
  /** Seconds until the limit resets, when the server supplied one. */
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    opts?: { rateLimited?: boolean; retryAfterSeconds?: number },
  ) {
    super(message);
    this.name = 'ChatError';
    this.rateLimited = opts?.rateLimited ?? false;
    this.retryAfterSeconds = opts?.retryAfterSeconds;
  }
}

/**
 * Sends conversation history to the `chat` edge function and returns the
 * assistant's reply. The OpenAI API key lives server-side only (as the
 * OPENAI_API_KEY function secret) — this function never touches it directly.
 *
 * The server enforces a per-user burst and daily quota; a refusal surfaces as a
 * ChatError with `rateLimited: true` so the UI can say so plainly rather than
 * showing a generic failure.
 */
export async function sendChatMessage(messages: ChatMessage[]): Promise<string> {
  // The client has no timeout of its own, so a stalled connection would leave
  // the composer spinning indefinitely with no way to cancel. An LLM round trip
  // is slow but bounded; 45s is well past p99 and still short of "frozen".
  const { data, error } = await withTimeout(
    supabase.functions.invoke('chat', { body: { messages } }),
    CHAT_TIMEOUT_MS,
    'AI coach request',
  );

  if (error) {
    const parsed = await extractFunctionError(error);
    throw new ChatError(parsed.message, {
      rateLimited: parsed.rateLimited,
      retryAfterSeconds: parsed.retryAfterSeconds,
    });
  }

  if (typeof data?.reply !== 'string' || !data.reply) {
    throw new ChatError('Received an unexpected response from the AI coach.');
  }

  return data.reply;
}

interface ParsedFunctionError {
  message: string;
  rateLimited: boolean;
  retryAfterSeconds?: number;
}

async function extractFunctionError(error: unknown): Promise<ParsedFunctionError> {
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const body = await context.json();
      if (typeof body?.error === 'string') {
        return {
          message: body.error,
          rateLimited: context.status === 429 || body?.code === 'rate_limited',
          retryAfterSeconds:
            typeof body?.retryAfterSeconds === 'number' ? body.retryAfterSeconds : undefined,
        };
      }
    } catch {
      // fall through
    }
    if (context.status === 429) {
      return {
        message: "You've sent a lot of messages just now. Try again in a minute.",
        rateLimited: true,
      };
    }
  }
  if (error instanceof Error && error.message) {
    return { message: error.message, rateLimited: false };
  }
  return { message: 'Something went wrong. Please try again.', rateLimited: false };
}
