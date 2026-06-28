import { supabase } from '../lib/supabase';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class ChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatError';
  }
}

/**
 * Sends conversation history to the `chat` edge function and returns the
 * assistant's reply. The Anthropic API key lives server-side only — this
 * function never touches it directly.
 */
export async function sendChatMessage(messages: ChatMessage[]): Promise<string> {
  const { data, error } = await supabase.functions.invoke('chat', {
    body: { messages },
  });

  if (error) {
    const message = await extractFunctionError(error);
    throw new ChatError(message);
  }

  if (typeof data?.reply !== 'string' || !data.reply) {
    throw new ChatError('Received an unexpected response from the AI coach.');
  }

  return data.reply;
}

async function extractFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const body = await context.json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // fall through
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}
