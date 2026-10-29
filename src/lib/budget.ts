// Server-side token budget for the demo site.
// Subscription allowance (from x-ratelimit headers): 10,000,000 tokens/minute.
// Daily cap = 1/10 of that = 1,000,000 tokens/day (override: NERGY_DAILY_TOKEN_CAP).
// Per-request output is also clamped via max_tokens (override: NERGY_MAX_TOKENS).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export const DAILY_TOKEN_CAP = Number(process.env.NERGY_DAILY_TOKEN_CAP ?? 1_000_000);
export const MAX_TOKENS_PER_REQUEST = Number(process.env.NERGY_MAX_TOKENS ?? 1500);

const FILE = path.resolve(process.cwd(), 'data/usage.json');

const today = () => new Date().toISOString().slice(0, 10);

type Ledger = { date: string; tokens: number };
function load(): Ledger {
  try {
    const u = JSON.parse(readFileSync(FILE, 'utf8'));
    if (u && u.date === today()) return u;
  } catch { /* missing/corrupt */ }
  return { date: today(), tokens: 0 };
}

export function dailyUsage(): Ledger {
  return load();
}

export function remainingTokens(): number {
  return Math.max(0, DAILY_TOKEN_CAP - load().tokens);
}

export function addTokens(n: number): number {
  const u = load();
  u.tokens += Math.max(0, Math.floor(n));
  try {
    mkdirSync(path.dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(u));
  } catch { /* best effort */ }
  return u.tokens;
}

export class BudgetExceededError extends Error {
  constructor() {
    super(`Daily token budget of ${DAILY_TOKEN_CAP.toLocaleString()} exhausted for mistral.nergy — try again tomorrow.`);
    this.name = 'BudgetExceededError';
  }
}

export function assertBudget(): void {
  if (remainingTokens() <= 0) throw new BudgetExceededError();
}
