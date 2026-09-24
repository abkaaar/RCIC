/** Post-write verification — advanced agent retries when this fails. */

import { activeObjects, stickyText } from './board.js'
import { isNearDuplicate } from './normalize.js'
import type { BoardState, HandoffPack, VerifyResult } from './types.js'
import type { TrajectoryLogger } from './trajectory.js'

export function verifyHandoff(
  board: BoardState,
  handoff: HandoffPack,
  log?: TrajectoryLogger,
): VerifyResult {
  const checks: VerifyResult['checks'] = []
  const stickies = activeObjects(board).filter((o) => o.type === 'sticky')

  // Export schema
  const exportValid =
    typeof handoff.summary === 'string' &&
    Array.isArray(handoff.sections) &&
    Array.isArray(handoff.actionItems) &&
    Array.isArray(handoff.archivedDuplicateIds)
  checks.push({
    name: 'export_schema',
    pass: exportValid,
    detail: exportValid ? 'handoff JSON shape ok' : 'invalid handoff shape',
  })

  // Empty board special case
  if (stickies.length === 0) {
    const emptyOk = handoff.sections.length === 0 && handoff.actionItems.length === 0
    checks.push({
      name: 'empty_board',
      pass: emptyOk,
      detail: emptyOk ? 'no invented content' : 'agent invented content on empty board',
    })
  } else {
    // Residual near-duplicates among active stickies
    let residual = 0
    for (let i = 0; i < stickies.length; i++) {
      for (let j = i + 1; j < stickies.length; j++) {
        if (isNearDuplicate(stickyText(stickies[i]), stickyText(stickies[j]))) residual++
      }
    }
    checks.push({
      name: 'no_near_duplicates',
      pass: residual === 0,
      detail: residual === 0 ? 'no active near-duplicates' : `${residual} near-duplicate pair(s) remain`,
    })

    const sections = activeObjects(board).filter((o) => o.type === 'section')
    checks.push({
      name: 'has_sections',
      pass: sections.length > 0 || handoff.sections.length > 0,
      detail: `boardSections=${sections.length} handoffSections=${handoff.sections.length}`,
    })

    checks.push({
      name: 'summary_nonempty',
      pass: handoff.summary.trim().length > 0,
      detail: handoff.summary.slice(0, 120),
    })
  }

  const ok = checks.every((c) => c.pass)
  log?.event({
    kind: 'verify',
    name: 'verifyHandoff',
    output: { ok, checks },
  })
  return { ok, checks }
}
