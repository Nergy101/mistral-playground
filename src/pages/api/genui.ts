// POST /api/genui — JSON body { prompt, model?, mode? }.
// Generative UI demo: the model answers in OpenUI Lang (basic) or as A2UI v1.0
// NDJSON envelopes carrying OpenUI Lang statements (advanced). The browser
// renders the result with the @openuidev renderer; this endpoint only calls
// the chat model and returns the raw generation plus debug info.
import type { APIRoute } from 'astro';
import { chatDebug, textOf } from '../../lib/mistral';
import { BudgetExceededError } from '../../lib/budget';
import { OPENUI_CHAT_PROMPT } from '../../lib/openuiPrompt';

export const prerender = false;

export const MODELS = ['mistral-large-4', 'mistral-small-2603'] as const;
export type GenUiModel = (typeof MODELS)[number];
export const MODES = ['basic', 'advanced'] as const;
export type GenUiMode = (typeof MODES)[number];

// The component library instructions come from the vendored renderer bundle
// itself (openuiChatLibrary.prompt()), so the model only ever emits components
// the renderer actually has (root = Card(...), Button, BarChart, ...).
const BASIC_SYSTEM = `You are a Generative UI engine built on OpenUI (https://www.openui.com). The user describes what they want; you respond ONLY with OpenUI Lang code that renders it as a live interface.
Output raw OpenUI Lang only: no markdown, no code fences, no explanation before or after.
${OPENUI_CHAT_PROMPT}`;

const ADVANCED_SYSTEM = `You are a Generative UI agent speaking the A2UI v1.0 protocol (agent-to-renderer, https://www.openui.com/docs/api-reference/a2ui) with OpenUI Lang component payloads.
Respond ONLY with NDJSON — exactly one JSON message per line, no markdown fences, no commentary.
Line 1 MUST be a surface creation:
{"version":"v1.0","createSurface":{"surfaceId":"main","catalogId":"com.openui:chat","sendDataModel":true}}
Then send one or more component updates; each "components" entry is an OpenUI Lang statement (identifier = Expression):
{"version":"v1.0","updateComponents":{"surfaceId":"main","components":["root = Card([title, body])","title = CardHeader(\\"Hello\\")","body = TextContent(\\"World\\")"]}}
Prefer several updateComponents messages over one big one: build the UI progressively (e.g. a loading state first, then the real content). Reuse the same statement IDs to replace earlier statements — later entries for an ID win.
${OPENUI_CHAT_PROMPT}
Do not send deleteSurface — the surface stays visible.
CRITICAL: every line must be strictly valid JSON. OpenUI Lang strings use double quotes, so inside a JSON string they MUST be escaped as \\" — e.g. "title = TextContent(\\\\"Hello\\\\")". An unescaped inner quote breaks the whole line.`;

// Defensive cleanup: models occasionally wrap output in ``` fences despite
// instructions; strip them so the renderer/parser gets raw Lang or NDJSON.
function stripFences(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/);
  if (fence) s = fence[1].trim();
  return s;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const prompt = String(body.prompt ?? '');
    if (!prompt.trim()) return Response.json({ error: 'Missing "prompt"' }, { status: 400 });
    const model: GenUiModel = MODELS.includes(body.model) ? body.model : 'mistral-large-4';
    const mode: GenUiMode = MODES.includes(body.mode) ? body.mode : 'basic';

    const { data, debug } = await chatDebug({
      model,
      // small-4 only accepts reasoning_effort none/high; large-4 defaults to
      // high, which chatDebug already lowers to keep answers within budget
      reasoning_effort: model === 'mistral-large-4' ? 'low' : 'none',
      messages: [
        { role: 'system', content: mode === 'advanced' ? ADVANCED_SYSTEM : BASIC_SYSTEM },
        { role: 'user', content: prompt },
      ],
    });
    return Response.json({ mode, model, raw: stripFences(textOf(data.choices[0].message)), debug });
  } catch (e: any) {
    if (e instanceof BudgetExceededError) return Response.json({ error: e.message }, { status: 429 });
    return Response.json({ error: e.message }, { status: 500 });
  }
};
