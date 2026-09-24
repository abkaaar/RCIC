/** Acceptance scoring against gold fixtures. */

import { activeObjects, stickyText } from './board.js'
import { isNearDuplicate } from './normalize.js'
import type { BoardState, Fixture, HandoffPack, ScoreResult } from './types.js'

export function scoreRun(fixture: Fixture, board: BoardState, handoff: HandoffPack): ScoreResult {
  const details: string[] = []
  const stickies = activeObjects(board).filter((o) => o.type === 'sticky')
  const gold = fixture.gold

  const exportValid =
    typeof handoff.summary === 'string' &&
    Array.isArray(handoff.sections) &&
    Array.isArray(handoff.actionItems)

  if (stickies.length === 0 && gold.allowEmptyHandoff) {
    const pass =
      exportValid &&
      handoff.sections.length === 0 &&
      handoff.actionItems.length === 0 &&
      !/invent|created \d+ stick/i.test(handoff.summary)
    details.push(pass ? 'empty board handled correctly' : 'empty board mishandled')
    return {
      pass,
      score: pass ? 1 : 0,
      duplicateResidual: 0,
      actionItemCount: 0,
      clusterHits: 0,
      clusterExpected: 0,
      exportValid,
      details,
    }
  }

  // Duplicate residual: pairs among active stickies
  let duplicateResidual = 0
  for (let i = 0; i < stickies.length; i++) {
    for (let j = i + 1; j < stickies.length; j++) {
      if (isNearDuplicate(stickyText(stickies[i]), stickyText(stickies[j]))) duplicateResidual++
    }
  }

  const actionItemCount = handoff.actionItems.length
  const sectionTitles = [
    ...handoff.sections.map((s) => s.title),
    ...activeObjects(board)
      .filter((o) => o.type === 'section')
      .map((o) => String(o.data?.title ?? '')),
  ]
  const titleBlob = sectionTitles.join(' | ').toLowerCase()

  let clusterHits = 0
  for (const cluster of gold.expectedClusters) {
    if (titleBlob.includes(cluster.toLowerCase())) clusterHits++
    else details.push(`missing cluster: ${cluster}`)
  }

  const dupOk = duplicateResidual <= gold.maxDuplicateResidual
  const actionOk = actionItemCount >= gold.minActionItems
  const clusterOk =
    gold.expectedClusters.length === 0 ||
    clusterHits >= Math.ceil(gold.expectedClusters.length * 0.6)
  const sectionOk = !gold.mustHaveSections || handoff.sections.length > 0 || sectionTitles.length > 0

  if (!dupOk) details.push(`duplicate residual ${duplicateResidual} > ${gold.maxDuplicateResidual}`)
  if (!actionOk) details.push(`action items ${actionItemCount} < ${gold.minActionItems}`)
  if (!sectionOk) details.push('expected sections missing')
  if (!exportValid) details.push('export invalid')

  const parts = [
    exportValid ? 1 : 0,
    dupOk ? 1 : 0,
    actionOk ? 1 : 0,
    clusterOk ? 1 : 0,
    sectionOk ? 1 : 0,
  ]
  const score = parts.reduce((a, b) => a + b, 0) / parts.length
  const pass = parts.every((p) => p === 1)

  return {
    pass,
    score,
    duplicateResidual,
    actionItemCount,
    clusterHits,
    clusterExpected: gold.expectedClusters.length,
    exportValid,
    details,
  }
}
