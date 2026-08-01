# RCIC

Real-time collaborative infinite canvas — rooms, shapes, physics, offline sync, and session replay.

![RCIC architecture](docs/architecture.jpg)

## Quick start (Docker)

1. Install and start [Docker Desktop](https://docs.docker.com/get-docker/).
2. From the project root:

```bash
docker compose up --build
```

3. Open **http://localhost**

Create a board, share the URL, collaborate live.

| | |
|---|---|
| Stop | `Ctrl+C` or `docker compose down` |
| Wipe saved boards | `docker compose down -v` |
| Health check | `curl http://localhost/health` → `{"ok":true}` |

Snapshots are stored in the `rcic-data` volume. The UI is on port **80**; the sync server is also available on **1234**.

---

## Local development (optional)

Use this if you are changing code and want hot reload.

```bash
npm install
npm run dev
```

Open **http://localhost:5173** (API/Yjs on **:1234**; Vite proxies `/health`, `/rooms`, `/yjs`).

```bash
npm run typecheck
npm run build
```

---

## Tests

```bash
npm test              # unit + offline CRDT race
npm run test:race     # + live WebSocket race
npm run test:load     # 20-client load / p95 sync budget
npm run test:all      # everything Vitest covers
```

Smoke test (needs a running server — Docker or `npm run dev`):

```bash
npm run test:smoke

# Through the Docker nginx proxy:
#   PowerShell:  $env:SMOKE_WS_URL="ws://localhost/yjs"; npm run test:smoke
#   bash:        SMOKE_WS_URL=ws://localhost/yjs npm run test:smoke
```

---

## What you can do

- Live rooms with invite links and in-app board tabs
- Text, shapes, stickies, images, audio, ink (marker), connectors, comments, sections
- Code snippets, polls, tables, charts, stickers, voting, reactions, templates
- Hand tool (pan), rotate, physics (throw / attract / repel)
- Mini-map radar for peer viewports; offline edits via IndexedDB (merge on reconnect)
- Export PNG / SVG / JSON; session replay (time travel)

The architecture diagram above reflects the completed client + sync + Docker solution.

## Project layout

```
apps/web           React + Pixi client (nginx in Docker)
apps/server        Fastify + Yjs WebSocket relay
packages/shared    Shared types
tests/             Race and load tests
docs/              Architecture, issues, standards
docker-compose.yml
```

## Stack

React · Vite · PixiJS · Matter.js · Yjs · Fastify · Docker (nginx + Node)

Persistence is **Yjs disk snapshots** (`data/rooms/*.bin`) — no external database.

## Docs

- [Architecture diagram](docs/architecture.jpg)
- [Issues & fixes](docs/ISSUES.md)
- [Coding standards](docs/CODING_STANDARDS.md)

### Optional env vars

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `1234` | Server listen port |
| `DATA_DIR` | `./data/rooms` | Snapshot directory |
| `VITE_API_URL` | same origin | HTTP API base (build-time) |
| `VITE_WS_URL` | `ws(s)://host/yjs` | Yjs WebSocket base (build-time) |
| `SMOKE_WS_URL` | `ws://localhost:1234/yjs` | Smoke-test endpoint |
