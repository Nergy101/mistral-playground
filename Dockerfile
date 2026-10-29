# syntax=docker/dockerfile:1
# Multi-stage build for the mistral.nergy.space demo site (Astro 5 + @astrojs/node, standalone).
#
# MISTRAL_API_KEY is NOT baked into the image — pass it at runtime:
#   docker run -p 4321:4321 -e MISTRAL_API_KEY=... ghcr.io/nergy101/mistral-playground:latest
# Optional: NERGY_DAILY_TOKEN_CAP (default 1000000), NERGY_MAX_TOKENS (default 1500)

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# writable dir for the token-budget ledger (data/usage.json)
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
