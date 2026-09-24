# Hot take / insights (5 pts)

## Main failure mode

The advanced agent can **look finished** — sections exist, export validates, verify may pass under a lenient residual budget — while **semantic** duplicates remain (`Improve FCP` vs `Faster first paint`). String metrics (Levenshtein, prefix, Jaccard) do not capture paraphrase. Fixture `10-challenging-semantic` is included so this failure is measured, not hidden.

## Practical lesson for the next agent

1. Put **verification on the metric the user cares about**, not only on schema.
2. Separate **reproducible structure wins** (dedupe+cluster+verify) from **semantic understanding** that needs models — and if you add models, budget a deterministic fallback so judges can still reproduce the main result without keys.
3. Human approval belongs on **consequential writes**, not on every read; sandbox eval should be the default path in the README.

## What we would build next

A hybrid: keep the tool+verify loop as the spine; add an optional embedding/LLM paraphrase merge behind a flag, with fixtures that assert both the deterministic path and the “model-assisted” path when credentials exist.
