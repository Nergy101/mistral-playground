// POST /api/rt/finish?session=<id> — graceful end of speech (input_audio.end).
// The final transcription.done arrives over the SSE stream.
import type { APIRoute } from 'astro';
import { getSession, finishSession } from '../../../lib/realtime';

export const prerender = false;

export const POST: APIRoute = async ({ url }) => {
  const session = getSession(url.searchParams.get('session') ?? '');
  if (!session?.conn) return Response.json({ error: 'unknown session' }, { status: 404 });
  await finishSession(session);
  return new Response('ok');
};
