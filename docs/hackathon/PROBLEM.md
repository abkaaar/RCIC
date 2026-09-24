# CanvasOps — problem statement

## Four questions

### 01 Who has this problem?

Remote PMs and workshop facilitators who run brainstorms on a shared infinite canvas (here: RCIC boards). After a live multiplayer session they own the mess: stickies everywhere, near-duplicates from parallel typing, no thematic structure, and no clean handoff for engineering.

### 02 What bottleneck makes it worth solving?

Manual cleanup is slow and inconsistent. Two facilitators will group the same board differently. Near-duplicates (“dark mode” / “Dark Mode please”) survive. Action items hide inside prose. The bottleneck is **post-session structuring**, not capturing ideas during the meeting.

### 03 Does the agent solve it well?

CanvasOps advanced agent:

1. Reads a structured board snapshot (context)
2. Dedupes near-duplicates with an explicit similarity rule
3. Groups remaining ideas into titled sections
4. Extracts action items into a handoff pack
5. **Verifies** the result against acceptance checks and retries once if needed
6. Requires `--approve` before consequential live-room writes (sandbox eval is the default)

### 04 Can another person reproduce the result?

Yes. Synthetic fixtures under `evals/fixtures/`, Docker or local Node, and:

```bash
npm install
npm run canvasops:eval
```

Same cases for baseline and advanced → `evals/out/report.json`.

---

## Ambiguities and resolutions

| Ambiguity | Resolution |
|-----------|------------|
| What counts as a duplicate? | Normalize: trim, lower-case, collapse whitespace, strip trailing punctuation. Near-duplicate if Levenshtein ≤ 2, containment with length ratio ≥ 0.85, shorter is a prefix (≥4 chars), or word Jaccard ≥ 0.7. |
| May the agent delete objects? | In sandbox/eval: duplicates are marked `archived` in the working board (not silent hard-delete). Live consequential deletes require `--approve`. |
| What is an action item? | Gold labels in fixtures, plus heuristics: leading `TODO:` / `Action:` / `AI:` / imperative “Ship …” / “Fix …”. |
| Cluster titles | Advanced agent uses keyword buckets (UI, Performance, Backend, Process, Risk, Other). Gold fixtures list expected cluster labels for scoring (case-insensitive substring match). |
| Data | Synthetic only — no private boards or PII. |

## Pre-existing vs added

| Pre-existing (tag `pre-challenge-rcic`) | Added during challenge |
|----------------------------------------|------------------------|
| RCIC realtime canvas (Yjs, Pixi, physics, offline, replay, Docker/Firebase) | `canvasops/` agents, tools, verification |
| Shared canvas object model | ≥10 eval fixtures + scoring |
| Server room sync | Changelog, reproduction guide, traces, video script |

## Primary metric

**Task success rate** — fraction of fixtures where the run **passes** the acceptance rubric (see `canvasops/src/score.ts`):

- Valid handoff export
- Duplicate residual ≤ gold `maxDuplicateResidual`
- At least `minActionItems` action items found
- Cluster/section coverage meets gold `expectedClusters` (when non-empty)

Secondary: estimated human time per task (seconds), estimated cost per task (USD; $0 for deterministic agents).
