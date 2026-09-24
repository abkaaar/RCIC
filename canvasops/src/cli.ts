#!/usr/bin/env node
/** CanvasOps CLI — run agents and evaluation. */

import { resolve } from 'node:path'
import { runAdvanced } from './advanced.js'
import { runBaseline } from './baseline.js'
import { runEval } from './eval.js'
import { readFileSync, mkdirSync } from 'node:fs'
import type { Fixture } from './types.js'

function usage(): never {
  console.log(`CanvasOps CLI

Usage:
  npx tsx src/cli.ts eval [--only baseline|advanced]
  npx tsx src/cli.ts run --agent baseline|advanced --fixture <path> [--approve]

Examples:
  npm run canvasops:eval
  npm run canvasops:eval:baseline
`)
  process.exit(1)
}

const args = process.argv.slice(2)
const cmd = args[0]

if (cmd === 'eval') {
  const onlyIdx = args.indexOf('--only')
  const only =
    onlyIdx >= 0 ? (args[onlyIdx + 1] as 'baseline' | 'advanced') : 'both'
  const report = runEval({ only: only === 'baseline' || only === 'advanced' ? only : 'both' })
  console.log(JSON.stringify(report.comparison, null, 2))
  console.log(`\nWrote evals/out/report.json (${report.fixtureCount} fixtures)`)
  const b = report.comparison[0]
  console.log(`Primary: baseline=${b.simpleBaseline} advanced=${b.agentSolution} (${b.change})`)
  process.exit(0)
}

if (cmd === 'run') {
  const agentIdx = args.indexOf('--agent')
  const fixIdx = args.indexOf('--fixture')
  const approve = args.includes('--approve')
  const agent = agentIdx >= 0 ? args[agentIdx + 1] : ''
  const fixturePath = fixIdx >= 0 ? args[fixIdx + 1] : ''
  if (!agent || !fixturePath) usage()
  const fixture = JSON.parse(readFileSync(resolve(fixturePath), 'utf8')) as Fixture
  mkdirSync('traces/adhoc', { recursive: true })
  const trace = `traces/adhoc/${agent}-${fixture.id}.jsonl`
  const result =
    agent === 'baseline'
      ? runBaseline(fixture, trace, { approve })
      : runAdvanced(fixture, trace, { approve, sandbox: !approve })
  console.log(JSON.stringify(result.handoff, null, 2))
  console.log(`\nTrajectory: ${trace}`)
  process.exit(0)
}

usage()
