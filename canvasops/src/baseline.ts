/**
 * Baseline agent — one direct pass with basic instructions (PDF baseline example).
 * No dedupe, no theme clustering, no verification loop.
 */

import { cloneBoard, createSection, emptyHandoff, stickyText } from './board.js'
import { stripActionPrefix } from './normalize.js'
import { TrajectoryLogger } from './trajectory.js'
import type { BoardState, Fixture, HandoffPack } from './types.js'

export interface AgentRunResult {
  board: BoardState
  handoff: HandoffPack
  log: TrajectoryLogger
}

export function runBaseline(
  fixture: Fixture,
  tracePath: string,
  opts: { approve?: boolean } = {},
): AgentRunResult {
  const log = new TrajectoryLogger('baseline', tracePath)
  log.event({
    kind: 'instruction',
    message:
      'One-shot baseline: dump all sticky texts into a single "All Ideas" section. Extract action items only if text starts with TODO:/Action:/AI:/Fix:/Ship:. No dedupe. No verification.',
  })

  const board = cloneBoard(fixture.board)
  const stickies = board.objects.filter((o) => o.type === 'sticky' && !o.archived)

  if (stickies.length === 0) {
    const handoff = emptyHandoff('baseline', fixture.id)
    log.event({ kind: 'final', output: handoff })
    log.flush()
    return { board, handoff, log }
  }

  // Naive: one section, no reposition quality, keep duplicates
  const section = createSection('baseline_all', 'All Ideas', 400, 200, 0)
  board.objects.push(section)

  log.event({
    kind: 'tool_call',
    name: 'naive_group',
    input: { section: 'All Ideas', count: stickies.length },
  })
  log.event({
    kind: 'tool_result',
    name: 'naive_group',
    output: { stickyIds: stickies.map((s) => s.id) },
  })

  // Strict action prefix only (weaker than advanced heuristics)
  const actionItems = stickies
    .map((s) => ({ text: stickyText(s), id: s.id }))
    .filter((s) => /^(todo|action|ai|fix|ship)\s*:/i.test(s.text.trim()))
    .map((s) => ({ text: stripActionPrefix(s.text), sourceId: s.id }))

  // unused but documents approve gate awareness
  if (!opts.approve) {
    log.event({
      kind: 'human_checkpoint',
      message: 'Baseline runs in sandbox; live writes would require --approve',
    })
  }

  const handoff: HandoffPack = {
    fixtureId: fixture.id,
    generatedAt: new Date().toISOString(),
    agent: 'baseline',
    sections: [
      {
        title: 'All Ideas',
        stickyIds: stickies.map((s) => s.id),
        texts: stickies.map(stickyText),
      },
    ],
    actionItems,
    archivedDuplicateIds: [],
    summary: `Baseline dump of ${stickies.length} stickies into All Ideas; ${actionItems.length} prefixed action item(s).`,
  }

  log.event({ kind: 'final', output: { summary: handoff.summary, actions: actionItems.length } })
  log.flush()
  return { board, handoff, log }
}
