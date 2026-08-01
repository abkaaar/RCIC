/**
 * timeline — rebuild a Timeline from HistoryEvent[] for session replay scrubbing.
 */
import type { CanvasObject, HistoryEvent } from '@rcic/shared'

export interface Timeline {
  events: HistoryEvent[]
  t0: number
  t1: number
}

export function buildTimeline(events: HistoryEvent[], createdAt: number | null): Timeline {
  const sorted = events.slice().sort((a, b) => a.t - b.t)
  const t0 = createdAt ?? sorted[0]?.t ?? Date.now()
  const t1 = Math.max(Date.now(), sorted[sorted.length - 1]?.t ?? t0)
  return { events: sorted, t0, t1 }
}

/** rebuild the board state at absolute time t by folding events */
export function stateAt(tl: Timeline, t: number): CanvasObject[] {
  const map = new Map<string, CanvasObject>()
  for (const e of tl.events) {
    if (e.t > t) break
    switch (e.a) {
      case 'create':
        if (e.o) map.set(e.id, structuredClone(e.o))
        break
      case 'update': {
        const cur = map.get(e.id)
        if (cur && e.p) Object.assign(cur, structuredClone(e.p))
        break
      }
      case 'delete':
        map.delete(e.id)
        break
    }
  }
  return Array.from(map.values())
}
