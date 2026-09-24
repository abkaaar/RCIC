/**
 * Advanced CanvasOps agent — tools + memory + verification + optional retry.
 */

import { cloneBoard, emptyHandoff } from './board.js'
import {
  dedupeNearDuplicates,
  exportHandoff,
  getBoardSnapshot,
  groupIntoSections,
  type ToolContext,
} from './tools.js'
import { TrajectoryLogger } from './trajectory.js'
import { verifyHandoff } from './verify.js'
import type { Fixture } from './types.js'
import type { AgentRunResult } from './baseline.js'

export function runAdvanced(
  fixture: Fixture,
  tracePath: string,
  opts: { approve?: boolean; sandbox?: boolean } = {},
): AgentRunResult {
  const log = new TrajectoryLogger('advanced', tracePath)
  log.event({
    kind: 'instruction',
    message:
      'Advanced agent: snapshot → dedupe → groupIntoSections → exportHandoff → verify; retry once if verify fails. Sandbox archives duplicates. Live consequential writes need --approve.',
  })

  const board = cloneBoard(fixture.board)
  const ctx: ToolContext = {
    board,
    approve: opts.approve ?? false,
    sandbox: opts.sandbox ?? true,
    memory: { glossary: {}, lastClusters: [] },
    log,
  }

  const snap = getBoardSnapshot(ctx)
  if (snap.stickyCount === 0) {
    const handoff = emptyHandoff('advanced', fixture.id)
    log.event({ kind: 'final', output: handoff })
    log.flush()
    return { board, handoff, log }
  }

  // Carry cluster vocabulary in memory across steps
  for (const s of snap.stickies) {
    ctx.memory.glossary[`theme:${s.id}`] = s.theme
  }

  dedupeNearDuplicates(ctx)
  groupIntoSections(ctx)
  let handoff = exportHandoff(ctx, 'advanced', fixture.id)
  let verified = verifyHandoff(board, handoff, log)

  if (!verified.ok) {
    log.event({
      kind: 'retry',
      message: 'Verification failed — re-run dedupe + group once',
      output: verified.checks,
    })
    dedupeNearDuplicates(ctx)
    groupIntoSections(ctx)
    handoff = exportHandoff(ctx, 'advanced', fixture.id)
    verified = verifyHandoff(board, handoff, log)
    log.event({
      kind: 'decision',
      message: verified.ok ? 'Retry restored verification' : 'Accepting best-effort after retry',
      output: { ok: verified.ok },
    })
  }

  log.event({
    kind: 'final',
    output: {
      summary: handoff.summary,
      clusters: ctx.memory.lastClusters,
      verifyOk: verified.ok,
      glossarySize: Object.keys(ctx.memory.glossary).length,
    },
  })
  log.flush()
  return { board, handoff, log }
}
