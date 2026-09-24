# RC-board — AI & collaboration roadmap

Product: **RC-board** (C mark). Tagline: *AI-powered online whiteboard where ideas and teams connect.*

This document captures Phase 2–3 design after the UI rebrand. Implementation of live LLM calls is deferred.

## Phase 2 — AI assist (CanvasOps spine)

In-board entry: toolbar **Sparkles** → [`AiPanel`](../apps/web/src/ui/AiPanel.tsx) (preview UI shipped).

| Step | Action | Behavior |
|------|--------|----------|
| 2.1 | Snapshot | `getBoardSnapshot` from live Yjs room |
| 2.2 | Sandbox run | Advanced agent: dedupe → `groupIntoSections` → export handoff → `verify` (+ one retry) |
| 2.3 | Review UI | Diff proposed section moves / archived dupes / action list |
| 2.4 | Approve | User confirms before consequential writes (same gate as CLI `--approve`) |
| 2.5 | Semantic dedupe | Optional embedding/LLM behind a flag; deterministic path remains default |
| 2.6 | Audit | Log proposal id, fixture-like summary, approver, timestamp |

**Do not** auto-delete or rewrite the live board without approval.

Eval / agent code already lives under [`canvasops/`](../canvasops/) and [`docs/hackathon/`](./hackathon/).

## Phase 3 — Teams (esp. financial institutions)

Propose and prioritize below. Seed ideas (open for your list):

| Candidate | Why it helps finance / regulated teams |
|-----------|----------------------------------------|
| Room ACL / SSO | Close open-link edit risk |
| Compliance export | Extend session replay into auditable change packs |
| Redaction before AI | Strip PII / account numbers before model calls |
| Role: facilitator vs observer | Control who can approve AI writes |
| Domain templates | Credit committee, risk review, incident postmortem |
| Data residency | Region-locked inference / no-training BYOK |

### Your proposals

_Add feature requests here or in chat; we will reorder Phase 3 after Phase 2.1 wiring._

-
-
-
