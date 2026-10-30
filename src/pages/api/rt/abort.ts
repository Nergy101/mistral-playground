// POST /api/rt/abort?session=<id> — interruption: close the upstream WebSocket
// immediately, keeping the partial transcript. Broadcasts 'interrupted' on SSE.
import type { APIRoute } from 'astro';
import { getSession, abortSession } from '../../../lib/realtime';

export const prerender = false;

export const POST: APIRoute = async ({ url }) => {
  const session = getSession(url.searchParams.get('session') ?? '');
  if (!session?.conn) return Response.json({ error: 'unknown session' }, { status: 404 });
  await abortSession(session);
  return new Response('ok');
};
