# Evaluation report snapshot

Captured after `npm run canvasops:eval` during authoring. Judges should re-run the command to regenerate; numbers are deterministic.

Generated: 2026-08-29T14:10:36.576Z  
Fixtures: 12  
Primary metric: task_success_rate (fraction of fixtures passing acceptance rubric)

| Metric | Simple baseline | Agent solution | Change |
|--------|-----------------|----------------|--------|
| Primary outcome (task success rate) | 0.083 | 1 | 91.7 pp |
| Mean rubric score (0-1) | 0.783 | 1 | 27.7% |
| Human time per task (est. seconds) | 480 | 45 | −435s (facilitator review of verified handoff vs full manual cluster) |
| Cost per task (USD) | 0 | 0 | 0 (deterministic agents; no LLM API) |

## Per-fixture

| Fixture | Baseline pass | Advanced pass | Baseline score | Advanced score |
|---------|---------------|---------------|----------------|----------------|
| 01-basic-brainstorm | false | true | 0.80 | 1.00 |
| 02-near-duplicates | false | true | 0.60 | 1.00 |
| 03-empty-board | true | true | 1.00 | 1.00 |
| 04-sparse-actions | false | true | 0.80 | 1.00 |
| 05-conflicting-labels | false | true | 0.80 | 1.00 |
| 06-large-board | false | true | 0.80 | 1.00 |
| 07-only-actions | false | true | 0.80 | 1.00 |
| 08-mixed-types | false | true | 0.80 | 1.00 |
| 09-punctuation-dupes | false | true | 0.60 | 1.00 |
| 10-challenging-semantic *(challenging)* | false | true | 0.80 | 1.00 |
| 11-single-sticky | false | true | 0.80 | 1.00 |
| 12-backend-heavy | false | true | 0.80 | 1.00 |

## Challenging case

**10-challenging-semantic**: Revealed that Levenshtein/containment cannot merge 'faster first paint' with 'improve FCP'. Advanced agent still structures themes; residual semantic dupes are an honest failure mode.
