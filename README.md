# mistral-playground

**Le Chonk playground** — a demo website for the Mistral API, live at
[mistral.nergy.space](https://mistral.nergy.space/). Built with **Astro 5 +
@astrojs/node** (standalone server output).

Three demos on one page, all backed by server-side endpoints (`src/pages/api/*`)
so the API key never reaches the browser:

| Demo | Model | What it shows |
|---|---|---|
| **01 Voxtral** | `voxtral-mini-transcribe-3` + `mistral-large-4` | Record or upload audio → transcript → summarise, action items, or translate into 15 languages |
| **02 Multimodal** | `mistral-large-4` | Image → free-text description, or schema-constrained JSON extraction (receipt / whiteboard / chart / generic image presets) |
| **03 Tools & JSON** | `mistral-large-4` | Natural language → tool calls executed server-side → final answer, plus strict JSON mode |

Extras: an "under the hood" drawer showing the raw request/response and token
usage for every call, and a server-side daily token budget.

## Token budget (server-side)

All endpoints enforce a daily token cap, tracked in `data/usage.json`:

- `NERGY_DAILY_TOKEN_CAP` — daily cap, default **1,000,000 tokens** (1/10 of the
  subscription's 10M tokens/minute allowance, per the `x-ratelimit-*` headers)
- `NERGY_MAX_TOKENS` — per-request `max_tokens` clamp, default 1500

When the cap is hit, endpoints return `429` with an explanatory message.
Check status at `GET /api/budget`.

## Run locally

```
npm install
npm run dev      # dev server on :4321
# or production:
npm run build
npm start        # serves dist/server on :4321 (PORT env to change)
```

The API key is read from `MISTRAL_API_KEY` (or a `.env` file — see below).

## Deploy

### Docker Compose (recommended)

```
cp .env.example .env   # then put your MISTRAL_API_KEY in .env
docker compose up -d   # serves on :4321
```

Compose passes every variable from the `.env` sitting next to
`docker-compose.yml` into the container (`env_file`). `.env` is gitignored;
`.env.example` is committed as the template.

### Docker / GHCR

Prebuilt image: `ghcr.io/nergy101/mistral-playground:latest`

```
docker build -t ghcr.io/nergy101/mistral-playground:latest .
docker push ghcr.io/nergy101/mistral-playground:latest
docker run -p 4321:4321 -e MISTRAL_API_KEY=... ghcr.io/nergy101/mistral-playground:latest
```

`MISTRAL_API_KEY` is a runtime env var only — never baked into the image
(see `.dockerignore`). Optional env: `NERGY_DAILY_TOKEN_CAP`,
`NERGY_MAX_TOKENS`, `PORT` (default 4321).
