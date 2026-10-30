// POST /api/rt/start?language=nl — open a realtime transcription session.
// Returns { session } — the browser then subscribes to /api/rt/events and
// POSTs PCM chunks to /api/rt/audio.
import type { APIRoute } from 'astro';
import { startSession } from '../../../lib/realtime';

export const prerender = false;

export const POST: APIRoute = async ({ url }) => {
  const id = crypto.randomUUID();
  const language = url.searchParams.get('language') || undefined; // undefined = auto/mixed
  try {
    await startSession(id, language);
    return Response.json({ session: id, language: language ?? null });
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 502 });
  }
};
