# Solution video script (≤ 5 minutes)

Record this as a screen capture. Upload the file or link with the HackerEarth submission.

## 0:00–0:40 — Problem + user

- Show `docs/hackathon/PROBLEM.md` four questions (or slides).
- Line: “Facilitators leave brainstorms with a noisy RCIC board — duplicates, no clusters, buried actions.”
- Disclose: RCIC canvas existed before the challenge (tag `pre-challenge-rcic`); CanvasOps is what we added.

## 0:40–1:30 — Simple baseline

- Open `evals/fixtures/02-near-duplicates.json` briefly.
- Run: `npm run canvasops:eval:baseline` (or full eval and point at baseline column).
- Show baseline handoff: single `All Ideas` section, duplicates still present, weak action extraction.
- Show a baseline trajectory snippet: one `naive_group` call, no verify.

## 1:30–3:20 — Realistic advanced execution (end-to-end)

- Run advanced on the same fixture (or show from full `npm run canvasops:eval`).
- Walk `traces/advanced/02-near-duplicates.jsonl`: instruction → `getBoardSnapshot` → `dedupeNearDuplicates` → `groupIntoSections` → `exportHandoff` → `verify`.
- Show advanced handoff JSON: themed sections, archived duplicate ids, action items.
- Mention `--approve` / sandbox: consequential live writes gated; eval is sandboxed.

## 3:20–4:10 — Comparison + changelog

- Show `evals/out/report.md` table: primary success **baseline 0.083 → advanced 1.000**.
- Changelog highlight: **verification + retry** was the biggest reliability keep; cite Iteration 3.
- Removed experiment: external LLM semantic merge (Iteration 4) — dropped for reproducibility.

## 4:10–5:00 — Challenging case + close

- Open fixture `10-challenging-semantic` notes.
- Hot take: string dedupe ≠ meaning; next agent should keep verify spine and optional semantic layer.
- End on: “Same fixtures, same commands, $0 API cost — clone and run `npm run canvasops:eval`.”

## B-roll ideas

- RCIC live board UI (Docker) for 5–10 seconds only — substrate, not the scored agent story.
- Split screen: baseline handoff vs advanced handoff.
