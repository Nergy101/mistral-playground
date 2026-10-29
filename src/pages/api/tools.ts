// POST /api/tools — JSON body { prompt, tools?: string[], jsonMode?: boolean }.
// The model emits tool calls for the selected tools, the server executes the
// (mocked) tools, then either composes a prose answer or returns strict JSON.
import type { APIRoute } from 'astro';
import { chatDebug, textOf } from '../../lib/mistral';
import { BudgetExceededError } from '../../lib/budget';

export const prerender = false;

const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather forecast for a city',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
        },
        required: ['city', 'unit'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculator',
      description: 'Evaluate an arithmetic expression exactly',
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string', description: 'e.g. "(12 + 8) * 1.5"' } },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Search a fake product catalogue',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
];

const MOCK_PRODUCTS = [
  { name: 'Chonk-sized keyboard', price: 129 },
  { name: 'Extra-large mousepad', price: 39 },
  { name: 'Catnip espresso beans', price: 12 },
];

function executeTool(name: string, args: any): string {
  if (name === 'get_weather') {
    const temp = args.unit === 'celsius' ? 18 : 64;
    return JSON.stringify({ city: args.city, temp_c: temp, rain_mm: 6, wind: '18 km/h', conditions: 'partly cloudy' });
  }
  if (name === 'calculator') {
    // Safe arithmetic evaluation: numbers and operators only.
    if (!/^[\d\s+\-*/().%]+$/.test(args.expression)) throw new Error('Invalid expression');
    const result = Function(`"use strict"; return (${args.expression})`)();
    return JSON.stringify({ expression: args.expression, result });
  }
  if (name === 'search_products') {
    const q = String(args.query).toLowerCase();
    const hits = MOCK_PRODUCTS.filter((p) => p.name.toLowerCase().includes(q));
    return JSON.stringify({ query: args.query, results: hits.length ? hits : MOCK_PRODUCTS });
  }
  throw new Error(`Unknown tool: ${name}`);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const prompt = typeof body.prompt === 'string' && body.prompt.trim()
      ? body.prompt
      : "What's the weather in Utrecht tomorrow, and should I bike to the office?";
    const jsonMode = !!body.jsonMode;
    const wanted: string[] = Array.isArray(body.tools) && body.tools.length
      ? body.tools
      : ['get_weather'];
    const tools = TOOL_DEFS.filter((t) => wanted.includes(t.function.name));

    const round1 = await chatDebug({
      messages: [{ role: 'user', content: prompt }],
      tools,
      tool_choice: 'auto',
    });
    const assistantMsg = round1.data.choices[0].message;
    const toolCalls = assistantMsg.tool_calls ?? [];

    // No tool calls (e.g. the relevant tool is disabled): the round-1 message
    // is already the answer. Never send [user, assistant] back — the API
    // rejects a trailing assistant message without tool results.
    if (!toolCalls.length) {
      if (jsonMode) {
        const round2 = await chatDebug({
          messages: [{ role: 'user', content: `${prompt}\n\nAnswer the question above as JSON only, with keys "answer" (string) and "tools_used" (empty array — you called no tools).` }],
          response_format: { type: 'json_object' },
        });
        const raw = textOf(round2.data.choices[0].message);
        let parsed: unknown = null;
        try { parsed = JSON.parse(raw); } catch { /* leave null */ }
        return Response.json({
          prompt, jsonMode, toolCalls, executed: [], answerRaw: raw, answerJson: parsed,
          debug: { request: round1.debug.request, response: round2.data, usage: round2.debug.usage, latencyMs: round1.debug.latencyMs + round2.debug.latencyMs },
        });
      }
      return Response.json({
        prompt, jsonMode, toolCalls, executed: [], answer: textOf(assistantMsg),
        debug: { request: round1.debug.request, response: round1.data, usage: round1.debug.usage, latencyMs: round1.debug.latencyMs },
      });
    }

    const executed = toolCalls.map((tc: any) => {
      const args = JSON.parse(tc.function.arguments);
      const result = executeTool(tc.function.name, args);
      return { name: tc.function.name, arguments: args, result: JSON.parse(result) };
    });

    const messages = [
      { role: 'user', content: prompt },
      assistantMsg,
      ...toolCalls.map((tc: any) => ({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.function.name,
        content: executeTool(tc.function.name, JSON.parse(tc.function.arguments)),
      })),
    ];

    if (jsonMode) {
      const round2 = await chatDebug({
        messages: [
          ...messages,
          { role: 'user', content: 'Answer the original question as JSON only, with keys "answer" (string) and "tools_used" (array of tool names you called).' },
        ],
        response_format: { type: 'json_object' },
      });
      const raw = textOf(round2.data.choices[0].message);
      let parsed: unknown = null;
      try { parsed = JSON.parse(raw); } catch { /* leave null */ }
      return Response.json({
        prompt, jsonMode, toolCalls, executed, answerRaw: raw, answerJson: parsed,
        debug: { request: round1.debug.request, response: round2.data, usage: round2.debug.usage, latencyMs: round1.debug.latencyMs + round2.debug.latencyMs },
      });
    }

    const round2 = await chatDebug({ messages, tools });
    return Response.json({
      prompt, jsonMode, toolCalls, executed, answer: textOf(round2.data.choices[0].message),
      debug: { request: round1.debug.request, response: round2.data, usage: round2.debug.usage, latencyMs: round1.debug.latencyMs + round2.debug.latencyMs },
    });
  } catch (e: any) {
    if (e instanceof BudgetExceededError) return Response.json({ error: e.message }, { status: 429 });
    return Response.json({ error: e.message }, { status: 500 });
  }
};
