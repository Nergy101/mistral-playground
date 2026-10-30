// Realtime transcription sessions for the Voxtral tab: bridges the Mistral
// realtime WebSocket (SDK RealtimeConnection) to browser clients over SSE.
// Same architecture as the sibling voxtral-demo server: the browser opens one
// SSE stream per session and POSTs each PCM chunk as its own request.
import { RealtimeTranscription, AudioEncoding } from '@mistralai/mistralai/extra/realtime/index.js';
import type { RealtimeConnection } from '@mistralai/mistralai/extra/realtime/index.js';
import { getApiKey } from './mistral';
import { addTokens } from './budget';

export const REALTIME_MODEL = 'voxtral-mini-transcribe-realtime-3';

type SseClient = ReadableStreamDefaultController<Uint8Array>;

export type RtSession = {
  conn: RealtimeConnection | null;
  clients: Set<SseClient>;
  done: boolean;
  closed: boolean;
  audioChunks: Uint8Array[];
  detectedLanguage: string | null;
};

// Module-level registry — the Astro node server keeps one module instance per
// process, so sessions survive across requests.
const sessions = new Map<string, RtSession>();

const encoder = new TextEncoder();

export function sseEncode(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(session: RtSession, event: string, data: unknown) {
  const payload = sseEncode(event, data);
  for (const c of session.clients) {
    try { c.enqueue(payload); } catch { session.clients.delete(c); }
  }
}

export function getSession(id: string): RtSession | undefined {
  return sessions.get(id);
}

export async function startSession(id: string, language?: string): Promise<RtSession> {
  const session: RtSession = {
    conn: null,
    clients: new Set(),
    done: false,
    closed: false,
    audioChunks: [],
    detectedLanguage: null,
  };
  sessions.set(id, session);

  const realtime = new RealtimeTranscription({ apiKey: getApiKey() });
  const conn = await realtime.connect(REALTIME_MODEL, {
    audioFormat: { encoding: AudioEncoding.PcmS16le, sampleRate: 16000 },
    targetStreamingDelayMs: 480, // balance latency vs accuracy (80ms..2400ms)
    ...(language ? { language } : {}), // undefined = auto-detect / mixed
  });
  session.conn = conn;
  broadcast(session, 'upstream.open', { model: REALTIME_MODEL });

  // Pump SDK events to all SSE subscribers until the connection closes.
  (async () => {
    try {
      for await (const ev of conn.events()) {
        if (ev.type === 'transcription.text.delta') {
          broadcast(session, 'delta', { text: ev.text });
        } else if (ev.type === 'transcription.done') {
          session.done = true;
          if (ev.usage?.total_tokens) addTokens(ev.usage.total_tokens);
          broadcast(session, 'done', { text: ev.text ?? '', usage: ev.usage ?? null });
        } else if (ev.type === 'transcription.language') {
          session.detectedLanguage = ev.audioLanguage;
          broadcast(session, 'language', { language: ev.audioLanguage });
        } else if (ev.type === 'error') {
          broadcast(session, 'error', { message: ev.error?.message ?? String(ev.error) });
        } else {
          broadcast(session, ev.type, ev);
        }
      }
    } catch (e: any) {
      broadcast(session, 'error', { message: String(e?.message ?? e) });
    } finally {
      session.closed = true;
      broadcast(session, 'upstream.closed', {});
      // Drop the session from the registry once the upstream is gone and no
      // SSE clients remain; keep it briefly so late subscribers get a 404-free close.
      setTimeout(() => {
        if (session.closed && session.clients.size === 0) sessions.delete(id);
      }, 60_000);
    }
  })();

  return session;
}

export function pushAudio(session: RtSession, chunk: Uint8Array): void {
  if (chunk.length > 0) session.audioChunks.push(chunk);
  if (!session.closed && chunk.length > 0 && session.conn) {
    session.conn.sendAudio(chunk).catch(() => {});
  }
}

export async function finishSession(session: RtSession): Promise<void> {
  if (!session.conn) return;
  // Graceful end of speech: SDK sends input_audio.end, server replies transcription.done.
  await session.conn.endAudio();
}

export async function abortSession(session: RtSession): Promise<void> {
  if (!session.conn) return;
  // Interruption: close the SDK connection immediately (no input_audio.end).
  // Partial transcript received so far is kept.
  session.closed = true;
  await session.conn.close(1000, 'client interrupted');
  broadcast(session, 'interrupted', { note: 'Aborted by user — partial transcript kept.' });
}
