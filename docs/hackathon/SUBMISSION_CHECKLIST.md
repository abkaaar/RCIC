# Submission checklist (HackerEarth)

Deadline: **Mon Aug 31, 18:00 UTC**

## Deliverable 01 — Code + changelog

- [x] Full project runnable (`npm install` + `npm run canvasops:eval`)
- [x] Agent instructions in code + `docs/hackathon/`
- [x] README introduces user, bottleneck, value (`docs/hackathon/README.md`)
- [x] Improvement Changelog (`docs/hackathon/CHANGELOG.md`)
- [x] Main failure mode + hot take (`docs/hackathon/HOT_TAKE.md`)
- [x] Pre-existing vs added disclosed (`pre-challenge-rcic` tag)

## Deliverable 02 — Reproduction guide

- [x] `docs/hackathon/REPRODUCTION.md`

## Deliverable 03 — Solution video (≤5 min)

- [ ] Record using `docs/hackathon/VIDEO_SCRIPT.md`
- [ ] Upload / link in HackerEarth submission

## Deliverable 04 — Agent trajectories

- [x] `traces/baseline/*.jsonl`
- [x] `traces/advanced/*.jsonl`
- [x] `traces/cursor/README.md` + `docs/hackathon/AGENT_TOOLS.md`

## Integrity

- [x] No credentials in repo
- [x] Synthetic fixtures only
- [x] Sandbox default; `--approve` for consequential live writes

## Before upload

1. `npm run canvasops:eval` one last time
2. Record video
3. Zip or push branch `hackathon/frontier-2026`
4. Submit on HackerEarth (individual account)
