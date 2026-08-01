# RCIC sync server — Fastify + Yjs WebSocket relay
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN npm install --workspace=@rcic/server --workspace=@rcic/shared --include-workspace-root

COPY packages/shared ./packages/shared
COPY apps/server ./apps/server

ENV NODE_ENV=production
ENV PORT=1234
ENV DATA_DIR=/data/rooms

VOLUME ["/data"]
EXPOSE 1234

WORKDIR /app/apps/server
CMD ["npx", "tsx", "src/index.ts"]
