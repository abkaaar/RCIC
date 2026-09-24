# Cursor coding-agent trajectories

The product agents under `traces/baseline` and `traces/advanced` are the CanvasOps runs judges should replay via `npm run canvasops:eval`.

This folder documents the **coding agent** used to implement CanvasOps during the hackathon:

| Field | Value |
|-------|--------|
| Tool | Cursor IDE Agent |
| Task | Implement CanvasOps per micro1 Agentic Workflows PDF on top of pre-existing RCIC |
| Human checkpoints | Plan approval; open-theme PDF confirmation; execute-plan instruction |
| Retries | Eval similarity rules revised after fixture `02` residual duplicates |

Representative implementation steps (condensed trajectory):

1. **Instruction** — Build baseline vs advanced agents, ≥10 fixtures, eval report, disclosure docs.
2. **Tool use** — Create `canvasops/` package, fixtures, board tools with `--approve` gate.
3. **Feedback** — First eval pass; tighten `isNearDuplicate` (prefix + Jaccard).
4. **Result** — Advanced task success 1.000 vs baseline 0.083 on 12 fixtures.

Export full Cursor chat transcripts into this folder if the submission portal requests raw UI traces; otherwise the JSONL agent runs plus this disclosure satisfy Deliverable 04 together with [AGENT_TOOLS.md](../docs/hackathon/AGENT_TOOLS.md).
