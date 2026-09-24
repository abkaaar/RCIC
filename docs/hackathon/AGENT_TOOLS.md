# Agent tools disclosure — Frontier Engineering Challenge 2026

Coding-agent use is required. This file lists every agent used to build and run CanvasOps.

| Tool | Role | Models / notes |
|------|------|----------------|
| Cursor Agent (Composer) | Primary coding agent for implementation, fixtures, eval harness, docs | Composer / Auto in Cursor IDE |
| CanvasOps baseline agent | In-repo one-shot workflow under `canvasops/src/baseline.ts` | Deterministic script (no LLM API) |
| CanvasOps advanced agent | In-repo tool+verify loop under `canvasops/src/advanced.ts` | Deterministic tool agent (no LLM API required for eval) |

## Why deterministic in-repo agents?

Judges must reproduce results from a clean environment without private API keys (Ground rule 08, Reproducibility 15 pts). The **product agents** (baseline vs advanced) are therefore pure TypeScript tool loops. Cursor was used to author them; representative Cursor and CanvasOps trajectories live in `traces/`.

## How to regenerate trajectories

```bash
npm run canvasops:eval
# writes traces/baseline/*.jsonl and traces/advanced/*.jsonl
```

Optional: if you used additional chat agents while iterating, export those transcripts into `traces/cursor/` and list them in the submission zip.
