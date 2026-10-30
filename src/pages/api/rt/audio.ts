// POST /api/rt/audio?session=<id> — one PCM s16le 16kHz mono chunk per request
// (reliable in all browsers — no long-lived streaming body that Chrome may cancel).
import type { APIRoute } from 'astro';
import { getSession, pushAudio } from '../../../lib/realtime';

export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
  const session = getSession(url.searchParams.get('session') ?? '');
  if (!session) return Response.json({ error: 'unknown session' }, { status: 404 });
  const body = new Uint8Array(await request.arrayBuffer());
  pushAudio(session, body);
  return Response.json({ ok: true, bytes: body.length });
};
