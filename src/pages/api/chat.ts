// POST /api/chat — JSON body { prompt, system? }.
// Generic single-shot chat completion, used by the Voxtral "Le Chonk thinks" pills.
import type { APIRoute } from 'astro';
import { chatDebug, textOf } from '../../lib/mistral';
import { BudgetExceededError } from '../../lib/budget';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const prompt = String(body.prompt ?? '');
    if (!prompt.trim()) return Response.json({ error: 'Missing "prompt"' }, { status: 400 });
    const messages = [
      ...(body.system ? [{ role: 'system', content: String(body.system) }] : []),
      { role: 'user', content: prompt },
    ];
    const { data, debug } = await chatDebug({ messages });
    return Response.json({ answer: textOf(data.choices[0].message), debug });
  } catch (e: any) {
    if (e instanceof BudgetExceededError) return Response.json({ error: e.message }, { status: 429 });
    return Response.json({ error: e.message }, { status: 500 });
  }
};
