# Reproduction guide

Written for someone starting from a **clean environment**.

## Requirements

| Item | Version / note |
|------|----------------|
| Node.js | 20+ recommended (18+ should work) |
| npm | 10+ |
| OS | macOS, Linux, or Windows |
| Network | Only needed for `npm install` (no LLM API keys) |
| Docker | Optional — RCIC UI demo only; CanvasOps eval is Node-only |

## Setup

```bash
git clone <this-repo>
cd RCIC
git checkout hackathon/frontier-2026
# Pre-challenge substrate tag (disclosure):
git show pre-challenge-rcic --stat | head
npm install
```

Approximate install time: 1–3 minutes depending on network.

## Run evaluation (baseline + advanced, same fixtures)

```bash
npm run canvasops:eval
```

**Expected output (shape):**

- Console prints comparison rows including primary task success rate
- Files written:
  - `evals/out/report.json`
  - `evals/out/report.md`
  - `evals/out/*.handoff.json` per fixture/agent
  - `traces/baseline/<fixtureId>.jsonl`
  - `traces/advanced/<fixtureId>.jsonl`

**Expected primary result (deterministic):** advanced task success rate **>** baseline (locally observed **1.000 vs 0.083** on 12 fixtures).

Approximate runtime: **&lt; 5 seconds** on a laptop.  
Approximate cost: **$0** (no model API).

### Baseline only / advanced only

```bash
npm run canvasops:eval:baseline
npm run canvasops:eval:advanced
```

### Single fixture ad-hoc run

```bash
npm run run:advanced -w @rcic/canvasops -- --fixture ../../evals/fixtures/02-near-duplicates.json
# Live consequential writes (not used in eval):
npm run run:advanced -w @rcic/canvasops -- --fixture ../../evals/fixtures/01-basic-brainstorm.json --approve
```

## Data required

Synthetic boards only: `evals/fixtures/*.json` (12 cases). No private or production board data.

## Optional: RCIC canvas UI (pre-existing substrate)

```bash
docker compose up --build
# open http://localhost
```

CanvasOps eval does **not** require Docker or a running Yjs server — agents operate on sandboxed in-memory boards for reproducibility.

## Versions recorded at authoring

- Repo package `rcic@0.1.0`
- `@rcic/canvasops@0.1.0` with `tsx` for CLI
- Tag `pre-challenge-rcic` = commit `ca8430471d4eb1d930f565a61789db7c676a408b`
