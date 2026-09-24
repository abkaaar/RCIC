# CanvasOps

Deterministic agentic workflows for structuring noisy brainstorm boards (RCIC object model, sandboxed).

```bash
# from repo root
npm run canvasops:eval
```

| Path | Role |
|------|------|
| `src/baseline.ts` | One-shot baseline agent |
| `src/advanced.ts` | Tool + verify advanced agent |
| `src/tools.ts` | `getBoardSnapshot`, `dedupeNearDuplicates`, `groupIntoSections`, `exportHandoff`, approve gate |
| `src/eval.ts` | Fair baseline vs advanced evaluation |

See [docs/hackathon/](../docs/hackathon/) for the full submission package.
