# RC-board

Real-time collaborative infinite canvas — rooms, shapes, physics, offline sync, and session replay.

**RC-board** — AI-powered online whiteboard where ideas and teams connect.

## CanvasOps (micro1 Frontier / Agentic Workflows 2026)

Hackathon entry: agentic post-brainstorm structuring on top of RCIC.

- **Docs:** [docs/hackathon/README.md](docs/hackathon/README.md)
- **Eval:** `npm run canvasops:eval` → `evals/out/report.json`
- **Pre-challenge substrate tag:** `pre-challenge-rcic`

Primary result (deterministic, no API keys): advanced task success **1.000** vs baseline **0.083** on 12 synthetic fixtures.

![RCIC architecture](docs/architecture.jpg)

## Auth + Firestore (Google sign-in)

**Project:** `rc-board-b63dc` (see [`.firebaserc`](.firebaserc))

- **Auth:** Google sign-in only (Firebase Auth)
- **Create board:** Google required; Yjs server (`POST /rooms`) must be up; Firestore stores board metadata
- **Invite join:** Google required too (invitee signs in, then JoinModal for name/cursor); `memberIds` updated in Firestore
- **Canvas sync:** Yjs WebSocket — already realtime for shapes/cursors (not Firestore)
- **Board metadata:** Firestore `onSnapshot` — board list, titles, and membership update live (usually under a second)

### Local env

```bash
cp apps/web/.env.example apps/web/.env.local
# Fill VITE_FIREBASE_* from Firebase Console → Project settings → Your apps
npm run dev   # starts web + Yjs server together
```

If you see **“Failed to get document because the client is offline”**, the Firestore database usually does not exist yet for this project (step 3 below).

### Firebase Console checklist

1. Enable **Authentication → Sign-in method → Google**
2. Add authorized domains: `localhost` and your Hosting domain
3. **Create a Firestore database** (Build → Firestore Database → Create) — required or the client stays “offline”
4. Deploy rules: `firebase deploy --only firestore:rules`

Both creating a board and opening an invite link require Google sign-in. The landing page shows a warning when the Yjs sync server is unreachable.

## Deploy on Firebase (Hosting + Cloud Run)

The UI is served by **Firebase Hosting**. The Yjs WebSocket sync server runs on **Cloud Run** (Hosting alone cannot keep long-lived sockets). Room snapshots go to **Cloud Storage** when `GCS_BUCKET` is set.

**Project:** `rc-board-b63dc` · **Region:** `europe-west1`

### One-time setup

1. Install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (required for `npm run deploy:server`) and log in.

On Windows (PowerShell):

```powershell
winget install -e --id Google.CloudSDK
# Close this terminal and open a new one so PATH picks up gcloud
gcloud auth login
gcloud config set project rc-board-b63dc
firebase login
firebase use rc-board-b63dc
```

2. Enable APIs and create the snapshot bucket:

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com storage.googleapis.com

gcloud storage buckets create gs://rc-board-b63dc-rcic-rooms \
  --project=rc-board-b63dc \
  --location=europe-west1
```

3. Grant the Cloud Run runtime service account access to the bucket (replace `PROJECT_NUMBER` from `gcloud projects describe rc-board-b63dc --format="value(projectNumber)"`):

```bash
gcloud storage buckets add-iam-policy-binding gs://rc-board-b63dc-rcic-rooms \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

### Deploy

```bash
npm install
npm run deploy:server    # Cloud Run: rcic-server (max 1 instance)
firebase deploy --only firestore:rules,hosting
# or: npm run deploy:hosting after build
```

Hosting rewrites `/health`, `/rooms`, and `/yjs/**` to Cloud Run. Firebase web config still needs `VITE_FIREBASE_*` at build time.

| | |
|---|---|
| Change Firebase project | edit [`.firebaserc`](.firebaserc) |
| Override bucket / region | `GCS_BUCKET`, `CLOUD_RUN_REGION`, `GCLOUD_PROJECT` when running `deploy:server` |

Cloud Run uses **`--max-instances=1`** so all peers share one Yjs process. Scaling out needs a shared pub/sub layer (not included).

---

## Quick start (Docker)

1. Install and start [Docker Desktop](https://www.docker.com/get-docker/).
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

Snapshots are stored in the `rcic-data` volume (local filesystem). The UI is on port **80**; the sync server is also available on **1234**.

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
apps/web           React + Pixi client (nginx in Docker / Firebase Hosting)
apps/server        Fastify + Yjs WebSocket relay (Cloud Run)
packages/shared    Shared types
tests/             Race and load tests
docs/              Architecture, issues, standards
firebase.json      Hosting + Cloud Run rewrites
docker-compose.yml
```

## Stack

React · Vite · PixiJS · Matter.js · Yjs · Fastify · Docker · Firebase Hosting · Cloud Run · Cloud Storage

Persistence: **Yjs snapshots** — local `data/rooms/*.bin` (Docker) or **GCS** when `GCS_BUCKET` is set. No SQL database.

## Docs

- [Architecture diagram](docs/architecture.jpg)
- [AI & collaboration roadmap](docs/AI_ROADMAP.md)
- [Issues & fixes](ISSUES.md)
- [Coding standards](CODING_STANDARDS.md)

### Optional env vars

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `1234` (local) / Cloud Run sets `8080` | Server listen port |
| `DATA_DIR` | `./data/rooms` | Local snapshot directory |
| `GCS_BUCKET` | unset | If set, snapshots go to this Cloud Storage bucket |
| `VITE_API_URL` | same origin | HTTP API base (build-time) |
| `VITE_WS_URL` | `ws(s)://host/yjs` | Yjs WebSocket base (build-time) |
| `SMOKE_WS_URL` | `ws://localhost:1234/yjs` | Smoke-test endpoint |
