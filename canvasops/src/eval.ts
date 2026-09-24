/** Fair evaluation: same fixtures for baseline and advanced → report.json */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runAdvanced } from './advanced.js'
import { runBaseline } from './baseline.js'
import { scoreRun } from './score.js'
import type { Fixture, ScoreResult } from './types.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(here, '../..')

export interface CaseResult {
  fixtureId: string
  name: string
  challenging?: boolean
  baseline: ScoreResult & { ms: number }
  advanced: ScoreResult & { ms: number }
}

export interface EvalReport {
  generatedAt: string
  fixtureCount: number
  primaryMetric: string
  comparison: {
    metric: string
    simpleBaseline: string | number
    agentSolution: string | number
    change: string
  }[]
  cases: CaseResult[]
  challengingCase?: {
    id: string
    notes?: string
    revelation: string
  }
  estimates: {
    humanTimeSecPerTaskBaseline: number
    humanTimeSecPerTaskAdvanced: number
    costUsdPerTaskBaseline: number
    costUsdPerTaskAdvanced: number
  }
}

function loadFixtures(dir: string): Fixture[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Fixture)
}

export function runEval(opts: {
  only?: 'baseline' | 'advanced' | 'both'
  fixturesDir?: string
  outDir?: string
  tracesDir?: string
}): EvalReport {
  const only = opts.only ?? 'both'
  const fixturesDir = opts.fixturesDir ?? join(repoRoot, 'evals/fixtures')
  const outDir = opts.outDir ?? join(repoRoot, 'evals/out')
  const tracesDir = opts.tracesDir ?? join(repoRoot, 'traces')
  mkdirSync(outDir, { recursive: true })
  mkdirSync(join(tracesDir, 'baseline'), { recursive: true })
  mkdirSync(join(tracesDir, 'advanced'), { recursive: true })

  const fixtures = loadFixtures(fixturesDir)
  const cases: CaseResult[] = []

  for (const fixture of fixtures) {
    let baselineScore: ScoreResult & { ms: number }
    let advancedScore: ScoreResult & { ms: number }

    if (only === 'baseline' || only === 'both') {
      const t0 = Date.now()
      const run = runBaseline(fixture, join(tracesDir, 'baseline', `${fixture.id}.jsonl`))
      const scored = scoreRun(fixture, run.board, run.handoff)
      baselineScore = { ...scored, ms: Date.now() - t0 }
      writeFileSync(
        join(outDir, `${fixture.id}.baseline.handoff.json`),
        JSON.stringify(run.handoff, null, 2),
      )
    } else {
      baselineScore = {
        pass: false,
        score: 0,
        duplicateResidual: 0,
        actionItemCount: 0,
        clusterHits: 0,
        clusterExpected: 0,
        exportValid: false,
        details: ['skipped'],
        ms: 0,
      }
    }

    if (only === 'advanced' || only === 'both') {
      const t0 = Date.now()
      const run = runAdvanced(fixture, join(tracesDir, 'advanced', `${fixture.id}.jsonl`), {
        sandbox: true,
        approve: false,
      })
      const scored = scoreRun(fixture, run.board, run.handoff)
      advancedScore = { ...scored, ms: Date.now() - t0 }
      writeFileSync(
        join(outDir, `${fixture.id}.advanced.handoff.json`),
        JSON.stringify(run.handoff, null, 2),
      )
    } else {
      advancedScore = {
        pass: false,
        score: 0,
        duplicateResidual: 0,
        actionItemCount: 0,
        clusterHits: 0,
        clusterExpected: 0,
        exportValid: false,
        details: ['skipped'],
        ms: 0,
      }
    }

    cases.push({
      fixtureId: fixture.id,
      name: fixture.name,
      challenging: fixture.challenging,
      baseline: baselineScore,
      advanced: advancedScore,
    })
  }

  const baselinePassRate =
    cases.filter((c) => c.baseline.pass).length / Math.max(1, cases.length)
  const advancedPassRate =
    cases.filter((c) => c.advanced.pass).length / Math.max(1, cases.length)
  const baselineAvg =
    cases.reduce((s, c) => s + c.baseline.score, 0) / Math.max(1, cases.length)
  const advancedAvg =
    cases.reduce((s, c) => s + c.advanced.score, 0) / Math.max(1, cases.length)

  const challenging = fixtures.find((f) => f.challenging)

  const report: EvalReport = {
    generatedAt: new Date().toISOString(),
    fixtureCount: fixtures.length,
    primaryMetric: 'task_success_rate (fraction of fixtures passing acceptance rubric)',
    comparison: [
      {
        metric: 'Primary outcome (task success rate)',
        simpleBaseline: Number(baselinePassRate.toFixed(3)),
        agentSolution: Number(advancedPassRate.toFixed(3)),
        change: `${((advancedPassRate - baselinePassRate) * 100).toFixed(1)} pp`,
      },
      {
        metric: 'Mean rubric score (0-1)',
        simpleBaseline: Number(baselineAvg.toFixed(3)),
        agentSolution: Number(advancedAvg.toFixed(3)),
        change: `${(((advancedAvg - baselineAvg) / Math.max(0.001, baselineAvg)) * 100).toFixed(1)}%`,
      },
      {
        metric: 'Human time per task (est. seconds)',
        simpleBaseline: 480,
        agentSolution: 45,
        change: '−435s (facilitator review of verified handoff vs full manual cluster)',
      },
      {
        metric: 'Cost per task (USD)',
        simpleBaseline: 0,
        agentSolution: 0,
        change: '0 (deterministic agents; no LLM API)',
      },
    ],
    cases,
    challengingCase: challenging
      ? {
          id: challenging.id,
          notes: challenging.notes,
          revelation:
            challenging.notes ??
            'Semantic near-duplicates survive string metrics — verification catches structure but not meaning.',
        }
      : undefined,
    estimates: {
      humanTimeSecPerTaskBaseline: 480,
      humanTimeSecPerTaskAdvanced: 45,
      costUsdPerTaskBaseline: 0,
      costUsdPerTaskAdvanced: 0,
    },
  }

  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2))
  writeFileSync(join(outDir, 'report.md'), formatReportMd(report))
  return report
}

function formatReportMd(report: EvalReport): string {
  const lines: string[] = [
    '# CanvasOps evaluation report',
    '',
    `Generated: ${report.generatedAt}`,
    `Fixtures: ${report.fixtureCount}`,
    `Primary metric: ${report.primaryMetric}`,
    '',
    '| Metric | Simple baseline | Agent solution | Change |',
    '|--------|-----------------|----------------|--------|',
  ]
  for (const row of report.comparison) {
    lines.push(
      `| ${row.metric} | ${row.simpleBaseline} | ${row.agentSolution} | ${row.change} |`,
    )
  }
  lines.push('', '## Per-fixture', '')
  lines.push('| Fixture | Baseline pass | Advanced pass | Baseline score | Advanced score |')
  lines.push('|---------|---------------|---------------|----------------|----------------|')
  for (const c of report.cases) {
    lines.push(
      `| ${c.fixtureId}${c.challenging ? ' *(challenging)*' : ''} | ${c.baseline.pass} | ${c.advanced.pass} | ${c.baseline.score.toFixed(2)} | ${c.advanced.score.toFixed(2)} |`,
    )
  }
  if (report.challengingCase) {
    lines.push('', '## Challenging case', '')
    lines.push(`**${report.challengingCase.id}**: ${report.challengingCase.revelation}`)
  }
  lines.push('')
  return lines.join('\n')
}
