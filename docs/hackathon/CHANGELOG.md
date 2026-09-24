# Improvement changelog

Structure required by the Agentic Workflows PDF. Evidence from `npm run canvasops:eval` unless noted.

| Stage | What you tried and why | Evidence | Decision / learning |
|-------|------------------------|----------|---------------------|
| **Baseline** | One-shot dump into a single `All Ideas` section; action items only if `TODO:`/`Action:`/`AI:`/`Fix:`/`Ship:` prefix. Fair “basic instructions” baseline. | Task success **0.083** (1/12 fixtures — empty board only) | Established starting point: clustering and dedupe are the gap, not export JSON shape. |
| **Iteration 1** | Added `getBoardSnapshot` + keyword theme buckets (`groupIntoSections`) for better context/tools. | Mean score rose; many fixtures still failed on residual near-duplicates (`Dark Mode` vs `Dark Mode please`). | **Kept** thematic sections; **needed** explicit dedupe tool. |
| **Iteration 2** | Added `dedupeNearDuplicates` with Levenshtein ≤ 2 + containment ratio ≥ 0.85. | Fixture `02-near-duplicates` still left `dark mode please` active — prefix case not covered. | **Revised** similarity: add prefix (≥4 chars) and word Jaccard ≥ 0.7. |
| **Iteration 3** | Added `verifyHandoff` after export + one retry (re-dedupe + regroup). | Catch “looks done” boards where duplicate pairs remain; trajectories show `verify` → `retry` → `decision`. | **Kept** verification loop — largest reliability win in traces. |
| **Iteration 4 (removed)** | Experiment: merge stickies by embedding/cosine via an external LLM API for semantic dupes (`Improve FCP` ≈ `Faster first paint`). | Would break clean-env reproducibility (API keys, nondeterminism) and Ground rule 08. Challenging fixture `10-challenging-semantic` documents the gap. | **Removed** for submission. Lesson: measure what you can reproduce; name semantic miss as failure mode. |
| **Final** | Snapshot → dedupe → sections → export → verify(+retry); sandbox archive instead of silent hard-delete; `--approve` gate for live consequential writes. | Task success **1.000** vs baseline **0.083** (+91.7 pp) on 12 fixtures; cost $0. | Main contribution: **verification after tool writes**, not more UI chrome on RCIC. |

## Main failure mode

See [HOT_TAKE.md](./HOT_TAKE.md).
