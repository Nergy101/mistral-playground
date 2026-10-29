// Shared server-side helpers for calling the Mistral API.
// The API key never reaches the browser — all calls go through /api/* endpoints.
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const CHAT_URL = 'https://api.mistral.ai/v1/chat/completions';
export const TRANSCRIBE_URL = 'https://api.mistral.ai/v1/audio/transcriptions';

export const CHAT_MODEL = 'mistral-large-4';
export const TRANSCRIBE_MODEL = 'voxtral-mini-transcribe-3';

export function getApiKey(): string {
  if (process.env.MISTRAL_API_KEY) return process.env.MISTRAL_API_KEY;
  // Fall back to the sibling voxtral-demo .env so the site runs without extra setup.
  const envPath = path.resolve(process.cwd(), '../voxtral-demo/.env');
  try {
    const match = readFileSync(envPath, 'utf8').match(/^MISTRAL_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch { /* fall through */ }
  throw new Error('MISTRAL_API_KEY not set');
}

export async function chat(body: Record<string, unknown>) {
  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({ model: CHAT_MODEL, ...body }),
  });
  if (!res.ok) throw new Error(`Mistral API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// Timed chat call that also captures request/response + usage for the
// "Under the hood" drawer on the demo page. Enforces the daily token budget
// and clamps max_tokens server-side.
import { assertBudget, addTokens, remainingTokens, MAX_TOKENS_PER_REQUEST } from './budget';

export async function chatDebug(body: Record<string, unknown>) {
  assertBudget();
  const started = Date.now();
  const full = {
    model: CHAT_MODEL,
    max_tokens: Math.min(MAX_TOKENS_PER_REQUEST, remainingTokens()),
    // mistral-large-4 defaults to high reasoning, which can eat the whole
    // max_tokens budget and return finish_reason=length with no text part.
    reasoning_effort: 'low',
    ...body,
  };
  const res = await chat(full);
  if (res.usage?.total_tokens) addTokens(res.usage.total_tokens);
  return {
    data: res,
    debug: {
      request: full,
      response: res,
      usage: res.usage ?? null,
      latencyMs: Date.now() - started,
    },
  };
}

// Message content can be a string or an array of blocks (thinking + text); keep only text.
export function textOf(message: any): string {
  const c = message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  return '';
}
