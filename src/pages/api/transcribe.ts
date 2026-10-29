// POST /api/transcribe — multipart form: "audio" file, optional "language".
// Proxies to Voxtral batch transcription; the API key stays server-side.
import type { APIRoute } from 'astro';
import { getApiKey, TRANSCRIBE_URL, TRANSCRIBE_MODEL } from '../../lib/mistral';
import { assertBudget, addTokens, BudgetExceededError } from '../../lib/budget';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const form = await request.formData();
    const file = form.get('audio');
    if (!(file instanceof File)) {
      return Response.json({ error: 'Missing "audio" file in form data' }, { status: 400 });
    }
    if (file.size > 25 * 1024 * 1024) {
      return Response.json({ error: 'Audio too large (max 25 MB)' }, { status: 413 });
    }
    const language = String(form.get('language') || '').trim();

    const upstream = new FormData();
    upstream.append('model', TRANSCRIBE_MODEL);
    upstream.append('file', new File([await file.arrayBuffer()], file.name || 'audio.webm', { type: file.type || 'audio/webm' }));
    if (language) upstream.append('language', language);

    assertBudget();
    const started = Date.now();
    const res = await fetch(TRANSCRIBE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getApiKey()}` },
      body: upstream,
    });
    if (!res.ok) throw new Error(`Mistral API error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.usage?.total_tokens) addTokens(data.usage.total_tokens);
    return Response.json({
      text: data.text ?? '',
      model: TRANSCRIBE_MODEL,
      debug: {
        request: { endpoint: '/v1/audio/transcriptions', model: TRANSCRIBE_MODEL, language: language || 'auto', fileName: file.name, fileSize: file.size },
        response: data,
        usage: data.usage ?? null,
        latencyMs: Date.now() - started,
      },
    });
  } catch (e: any) {
    if (e instanceof BudgetExceededError) return Response.json({ error: e.message }, { status: 429 });
    return Response.json({ error: e.message }, { status: 500 });
  }
};
