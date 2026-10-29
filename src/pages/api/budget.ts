// GET /api/budget — current daily token budget status.
import type { APIRoute } from 'astro';
import { DAILY_TOKEN_CAP, dailyUsage, remainingTokens } from '../../lib/budget';

export const prerender = false;

export const GET: APIRoute = () =>
  Response.json({
    cap: DAILY_TOKEN_CAP,
    usedToday: dailyUsage().tokens,
    remaining: remainingTokens(),
    date: dailyUsage().date,
  });
