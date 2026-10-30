// GET /api/rt/events?session=<id> — SSE stream of realtime session events
// (delta / language / done / interrupted / error / upstream.closed).
import type { APIRoute } from 'astro';
import { getSession, sseEncode } from '../../../lib/realtime';

export const prerender = false;

export const GET: APIRoute = ({ url }) => {
  const id = url.searchParams.get('session') ?? '';
  const session = getSession(id);
  if (!session) {
    return Response.json({ error: 'unknown session' }, { status: 404 });
  }

  let controller: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      session.clients.add(c);
      c.enqueue(new TextEncoder().encode('retry: 1000\n\n'));
      c.enqueue(sseEncode('subscribed', { session: id }));
    },
    cancel() {
      session.clients.delete(controller);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
};
