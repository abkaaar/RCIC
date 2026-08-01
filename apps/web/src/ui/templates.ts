/**
 * templates — built-in board starters placed at viewport center (ISS-049).
 */
import { nanoid } from 'nanoid'
import {
  defaultConnector,
  defaultObject,
  portEndpoint,
  type CanvasObject,
  type ShapeKind,
} from '@rcic/shared'

export function brainstormingTemplate(cx: number, cy: number, z0: number): CanvasObject[] {
  const out: CanvasObject[] = []
  let z = z0

  const main = defaultObject(nanoid(8), 'section', cx, cy - 40, ++z)
  main.w = 720
  main.h = 480
  main.data = { title: 'Brainstorming Board' }
  out.push(main)

  const voteArea = defaultObject(nanoid(8), 'section', cx + 280, cy + 40, ++z)
  voteArea.w = 260
  voteArea.h = 320
  voteArea.color = '#a78bfa'
  voteArea.data = { title: 'Voting area' }
  out.push(voteArea)

  const stickies = [
    { x: cx - 200, y: cy - 80, t: 'Idea 1' },
    { x: cx - 20, y: cy - 80, t: 'Idea 2' },
    { x: cx - 200, y: cy + 100, t: 'Idea 3' },
    { x: cx - 20, y: cy + 100, t: 'Action item' },
  ]
  for (const s of stickies) {
    const o = defaultObject(nanoid(8), 'sticky', s.x, s.y, ++z)
    o.data = { ...o.data, text: s.t, html: s.t }
    out.push(o)
  }

  const action = defaultObject(nanoid(8), 'text', cx - 110, cy + 220, ++z)
  action.data = { text: 'Action items →', html: '<b>Action items →</b>', fontSize: 18, fontFamily: 'Inter', align: 'left' }
  out.push(action)

  return out
}

export function flowchartTemplate(cx: number, cy: number, z0: number): CanvasObject[] {
  const out: CanvasObject[] = []
  let z = z0

  const mk = (kind: ShapeKind, x: number, y: number, label: string) => {
    const o = defaultObject(nanoid(8), 'shape', x, y, ++z)
    o.data = { kind, label }
    if (kind === 'terminus') {
      o.w = 160
      o.h = 64
    } else if (kind === 'decision') {
      o.w = 140
      o.h = 140
    } else {
      o.w = 160
      o.h = 90
    }
    return o
  }

  const start = mk('terminus', cx, cy - 160, 'Start')
  const process = mk('process', cx, cy - 20, 'Process')
  const decision = mk('decision', cx, cy + 140, 'Decision?')
  const end = mk('terminus', cx + 220, cy + 140, 'End')
  out.push(start, process, decision, end)

  const link = (a: CanvasObject, fromSide: 'n' | 'e' | 's' | 'w', b: CanvasObject, toSide: 'n' | 'e' | 's' | 'w') => {
    const c = defaultConnector(nanoid(8), 'elbow', portEndpoint(a.id, fromSide), portEndpoint(b.id, toSide), ++z)
    c.x = (a.x + b.x) / 2
    c.y = (a.y + b.y) / 2
    c.w = 80
    c.h = 80
    out.push(c)
  }
  link(start, 's', process, 'n')
  link(process, 's', decision, 'n')
  link(decision, 'e', end, 'w')

  return out
}
