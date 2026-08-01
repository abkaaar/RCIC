/**
 * shapes/ports — port positions and connector path layout (ISS-014 / ISS-040).
 * Ports sit at mid-edges in object-local space, then rotated into world.
 * Endpoints may be port-attached or free world points.
 */
import type { CanvasObject, ConnectorEndpoint, ConnectorStyle, PortSide } from '@rcic/shared'
import { isFreeEndpoint, isPortEndpoint } from '@rcic/shared'

const SIDES: PortSide[] = ['n', 'e', 's', 'w']

export function allPortSides(): PortSide[] {
  return SIDES
}

/** Local offset from object center to port (before rotation). */
export function portLocal(obj: CanvasObject, side: PortSide): { x: number; y: number } {
  const hw = obj.w / 2
  const hh = obj.h / 2
  switch (side) {
    case 'n':
      return { x: 0, y: -hh }
    case 'e':
      return { x: hw, y: 0 }
    case 's':
      return { x: 0, y: hh }
    case 'w':
      return { x: -hw, y: 0 }
  }
}

export function portWorldPos(obj: CanvasObject, side: PortSide): { x: number; y: number } {
  const loc = portLocal(obj, side)
  const cos = Math.cos(obj.rotation)
  const sin = Math.sin(obj.rotation)
  return {
    x: obj.x + loc.x * cos - loc.y * sin,
    y: obj.y + loc.x * sin + loc.y * cos,
  }
}

/** Unit outward direction in world space for a port. */
export function portOutDir(obj: CanvasObject, side: PortSide): { x: number; y: number } {
  const loc = portLocal(obj, side)
  const len = Math.hypot(loc.x, loc.y) || 1
  const lx = loc.x / len
  const ly = loc.y / len
  const cos = Math.cos(obj.rotation)
  const sin = Math.sin(obj.rotation)
  return { x: lx * cos - ly * sin, y: lx * sin + ly * cos }
}

export function nearestPortSide(obj: CanvasObject, wx: number, wy: number): PortSide {
  let best: PortSide = 'e'
  let bestD = Infinity
  for (const s of SIDES) {
    const p = portWorldPos(obj, s)
    const d = Math.hypot(p.x - wx, p.y - wy)
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return best
}

export function oppositeSide(side: PortSide): PortSide {
  switch (side) {
    case 'n':
      return 's'
    case 's':
      return 'n'
    case 'e':
      return 'w'
    case 'w':
      return 'e'
  }
}

/** Offset for quick-add twin along a port outward. */
export function quickAddOffset(side: PortSide, gap = 220): { x: number; y: number } {
  switch (side) {
    case 'n':
      return { x: 0, y: -gap }
    case 's':
      return { x: 0, y: gap }
    case 'e':
      return { x: gap, y: 0 }
    case 'w':
      return { x: -gap, y: 0 }
  }
}

export function defaultMid(
  from: { x: number; y: number },
  to: { x: number; y: number },
  style: ConnectorStyle,
  fromDir?: { x: number; y: number },
  toDir?: { x: number; y: number },
): { x: number; y: number } {
  const mx = (from.x + to.x) / 2
  const my = (from.y + to.y) / 2
  if (style === 'line' || style === 'arrow') return { x: mx, y: my }
  if (style === 'elbow') {
    return { x: to.x, y: from.y }
  }
  const fx = fromDir?.x ?? 0
  const fy = fromDir?.y ?? 0
  const tx = toDir?.x ?? 0
  const ty = toDir?.y ?? 0
  const pull = Math.min(80, Math.hypot(to.x - from.x, to.y - from.y) * 0.25)
  return {
    x: mx + ((fx - tx) * pull) / 2,
    y: my + ((fy - ty) * pull) / 2,
  }
}

/** Fillet sharp elbow corners with short quadratic arcs (ISS-040). */
function filletPolyline(pts: { x: number; y: number }[], radius = 14, steps = 6): { x: number; y: number }[] {
  if (pts.length < 3) return pts
  const out: { x: number; y: number }[] = [pts[0]!]
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!
    const cur = pts[i]!
    const next = pts[i + 1]!
    const d0x = cur.x - prev.x
    const d0y = cur.y - prev.y
    const d1x = next.x - cur.x
    const d1y = next.y - cur.y
    const len0 = Math.hypot(d0x, d0y) || 1
    const len1 = Math.hypot(d1x, d1y) || 1
    const r = Math.min(radius, len0 / 2.2, len1 / 2.2)
    if (r < 2) {
      out.push(cur)
      continue
    }
    const a = { x: cur.x - (d0x / len0) * r, y: cur.y - (d0y / len0) * r }
    const b = { x: cur.x + (d1x / len1) * r, y: cur.y + (d1y / len1) * r }
    out.push(a)
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      const u = 1 - t
      out.push({
        x: u * u * a.x + 2 * u * t * cur.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * cur.y + t * t * b.y,
      })
    }
  }
  out.push(pts[pts.length - 1]!)
  return out
}

/** Quadratic Bezier samples from a→mid→b (mid is control). */
export function connectorPoints(
  a: { x: number; y: number },
  mid: { x: number; y: number },
  b: { x: number; y: number },
  style: ConnectorStyle,
  steps = 24,
): { x: number; y: number }[] {
  if (style === 'line' || style === 'arrow') return [a, b]
  if (style === 'elbow') {
    const sharp = [a, { x: mid.x, y: a.y }, mid, { x: mid.x, y: b.y }, b]
    const cleaned: { x: number; y: number }[] = []
    for (const p of sharp) {
      const last = cleaned[cleaned.length - 1]
      if (last && Math.hypot(last.x - p.x, last.y - p.y) < 0.5) continue
      cleaned.push(p)
    }
    return filletPolyline(cleaned)
  }
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    pts.push({
      x: u * u * a.x + 2 * u * t * mid.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * mid.y + t * t * b.y,
    })
  }
  return pts
}

export function bboxFromPoints(pts: { x: number; y: number }[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const pad = 12
  const w = Math.max(24, maxX - minX + pad * 2)
  const h = Math.max(24, maxY - minY + pad * 2)
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, w, h }
}

export function resolveEndpoint(
  ep: ConnectorEndpoint | undefined,
  hosts: Map<string, CanvasObject> | ((id: string) => CanvasObject | undefined),
): { pos: { x: number; y: number }; dir?: { x: number; y: number }; missing?: boolean } | null {
  if (!ep) return null
  const get = typeof hosts === 'function' ? hosts : (id: string) => hosts.get(id)
  if (isFreeEndpoint(ep)) {
    return { pos: { x: ep.x, y: ep.y } }
  }
  if (isPortEndpoint(ep)) {
    if (!ep.objectId) return { pos: { x: 0, y: 0 }, missing: true }
    const obj = get(ep.objectId)
    if (!obj) return { pos: { x: 0, y: 0 }, missing: true }
    return { pos: portWorldPos(obj, ep.side), dir: portOutDir(obj, ep.side) }
  }
  return null
}

export function layoutConnector(
  conn: CanvasObject,
  fromObj: CanvasObject | undefined,
  toObj: CanvasObject | undefined,
): { points: { x: number; y: number }[]; mid: { x: number; y: number }; from: { x: number; y: number }; to: { x: number; y: number } } | null {
  const fromEp = conn.data.from as ConnectorEndpoint | undefined
  const toEp = conn.data.to as ConnectorEndpoint | undefined
  const get = (id: string) => {
    if (fromObj?.id === id) return fromObj
    if (toObj?.id === id) return toObj
    return undefined
  }
  const aRes = resolveEndpoint(fromEp, get)
  const bRes = resolveEndpoint(toEp, get)
  if (!aRes || !bRes || aRes.missing || bRes.missing) return null

  const style = (conn.data.style as ConnectorStyle) || 'curve'
  const a = aRes.pos
  const b = bRes.pos
  let mid = conn.data.mid as { x: number; y: number } | undefined
  if (!mid || !Number.isFinite(mid.x) || !Number.isFinite(mid.y)) {
    mid = defaultMid(a, b, style, aRes.dir, bRes.dir)
  }
  const points = connectorPoints(a, mid, b, style)
  return { points, mid, from: a, to: b }
}

/** World corner positions: 0=NW, 1=NE, 2=SE, 3=SW (local). */
export function cornerWorld(obj: CanvasObject, corner: 0 | 1 | 2 | 3): { x: number; y: number } {
  const hw = obj.w / 2
  const hh = obj.h / 2
  const locals: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]
  const [lx, ly] = locals[corner]
  const cos = Math.cos(obj.rotation)
  const sin = Math.sin(obj.rotation)
  return { x: obj.x + lx * cos - ly * sin, y: obj.y + lx * sin + ly * cos }
}

export function oppositeCorner(corner: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 {
  return ((corner + 2) % 4) as 0 | 1 | 2 | 3
}

/** Preview points for rubber-band while connecting (ISS-040). */
export function previewConnectorPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
  style: ConnectorStyle,
): { x: number; y: number }[] {
  const mid = defaultMid(a, b, style)
  return connectorPoints(a, mid, b, style)
}
