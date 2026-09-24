# CanvasOps — hackathon README

**Frontier Engineering Challenge 2026 / micro1 Agentic Workflows**

## Intended user

Remote PMs and workshop facilitators who run brainstorms on a shared infinite canvas.

## Bottleneck

After a live multiplayer session the board is noisy: near-duplicate stickies, no thematic sections, buried action items, and inconsistent manual cleanup. Structuring the board for engineering handoff is the expensive step — not capturing ideas during the meeting.

## Why solving it is valuable

A facilitator can leave the room with a **verified handoff pack** (clusters, deduped ideas, action items) in under a minute of review instead of ~8 minutes of manual grouping — with evidence that the same fixtures improve under an advanced agent versus a fair baseline.

## Pre-existing vs added

| Pre-existing (git tag `pre-challenge-rcic`) | Added in this challenge |
|---------------------------------------------|-------------------------|
| RCIC realtime collaborative canvas (Yjs, Pixi, physics, offline, replay, Docker/Firebase) | `canvasops/` baseline + advanced agents, tools, verification |
| Shared object model & room sync | `evals/fixtures/` (12 synthetic cases) + scoring harness |
| | `docs/hackathon/*`, `traces/`, reproduction guide, video script |

## Quick start (reproduction)

```bash
npm install
npm run canvasops:eval
```

Outputs:

- `evals/out/report.json` — primary metric comparison
- `evals/out/report.md` — human-readable table
- `traces/baseline/*.jsonl` and `traces/advanced/*.jsonl` — agent trajectories

See [REPRODUCTION.md](./REPRODUCTION.md) for clean-environment detail.

## Primary metric (latest local run)

| Metric | Simple baseline | Agent solution | Change |
|--------|-----------------|----------------|--------|
| Task success rate | 0.083 | 1.000 | +91.7 pp |
| Mean rubric score | ~0.78 | 1.00 | uplift |
| Human time / task (est.) | 480s | 45s | −435s |
| Cost / task | $0 | $0 | deterministic agents |

Re-run `npm run canvasops:eval` to regenerate numbers on your machine.

## Docs in this folder

- [PROBLEM.md](./PROBLEM.md) — four questions + ambiguity resolutions
- [CHANGELOG.md](./CHANGELOG.md) — improvement changelog with evidence
- [REPRODUCTION.md](./REPRODUCTION.md) — setup commands
- [AGENT_TOOLS.md](./AGENT_TOOLS.md) — coding-agent disclosure
- [VIDEO_SCRIPT.md](./VIDEO_SCRIPT.md) — ≤5 minute demo script
- [HOT_TAKE.md](./HOT_TAKE.md) — main failure mode + insight
