/** In-memory sandboxed board — eval never needs live Yjs / Cloud Run. */

import type { BoardState, CanvasObject, HandoffPack } from './types.js'

export function cloneBoard(board: BoardState): BoardState {
  return JSON.parse(JSON.stringify(board)) as BoardState
}

export function activeObjects(board: BoardState): CanvasObject[] {
  return board.objects.filter((o) => !o.archived)
}

export function stickyText(o: CanvasObject): string {
  const t = o.data?.text
  return typeof t === 'string' ? t : ''
}

export function createSection(
  id: string,
  title: string,
  x: number,
  y: number,
  z: number,
): CanvasObject {
  return {
    id,
    type: 'section',
    x,
    y,
    w: 480,
    h: 320,
    rotation: 0,
    z,
    color: '#94a3b8',
    physics: { enabled: false, mode: 'normal', mass: 1 },
    data: { title },
  }
}

export function emptyHandoff(agent: HandoffPack['agent'], fixtureId?: string): HandoffPack {
  return {
    fixtureId,
    generatedAt: new Date().toISOString(),
    agent,
    sections: [],
    actionItems: [],
    archivedDuplicateIds: [],
    summary: 'Empty board — no structuring performed.',
  }
}
