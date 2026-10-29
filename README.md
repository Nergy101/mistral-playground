# mistral-nergy

Demo website for the Mistral API, built with **Astro 5 + @astrojs/node** (server output).
Intended to be hosted at **mistral.nergy.space**.

## What's inside

- `/` — landing page linking to the three demo suites
- `/demos/vision` — upload an image; `mistral-large-4` describes it and extracts JSON
- `/demos/tools` — natural language → tool calls → executed server-side → final answer; plus strict JSON mode
- `/demos/voxtral` — upload or record audio; `voxtral-mini-transcribe-3` transcribes it

All Mistral calls go through server-side endpoints (`src/pages/api/*`), so the
API key never reaches the browser. The key is read from `MISTRAL_API_KEY` or
falls back to `../voxtral-demo/.env`.

## Token budget (server-side)

All endpoints enforce a daily token cap, tracked in `data/usage.json`:

- `NERGY_DAILY_TOKEN_CAP` — daily cap, default **1,000,000 tokens** (1/10 of the
  subscription's 10M tokens/minute allowance, per the `x-ratelimit-*` headers)
- `NERGY_MAX_TOKENS` — per-request `max_tokens` clamp, default 1500

When the cap is hit, endpoints return `429` with an explanatory message.
Check status at `GET /api/budget`.

## Run

```
npm install
npm run dev      # dev server on :4321
# or production:
npm run build
npm start        # serves dist/server on :4321 (PORT env to change)
```

## Deploy

`npm run build` produces a standalone Node server in `dist/`. Point
mistral.nergy.space at a host running `npm start`.

### Docker / GHCR

```
docker build -t ghcr.io/nergy101/mistral-playground:latest .
docker push ghcr.io/nergy101/mistral-playground:latest
docker run -p 4321:4321 -e MISTRAL_API_KEY=... ghcr.io/nergy101/mistral-playground:latest
```

`MISTRAL_API_KEY` is a runtime env var only — it is never baked into the
image (see `.dockerignore`). Optional env: `NERGY_DAILY_TOKEN_CAP`,
`NERGY_MAX_TOKENS`, `PORT` (default 4321).

### Docker Compose (recommended)

```
cp .env.example .env   # then put your MISTRAL_API_KEY in .env
docker compose up -d   # serves on :4321
```

Compose passes every variable from the `.env` sitting next to
`docker-compose.yml` into the container (`env_file`). `.env` is
gitignored; `.env.example` is committed as the template.
