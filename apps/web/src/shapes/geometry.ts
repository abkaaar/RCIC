/**
 * shapes/geometry — shared path math for Pixi ObjectView and SVG export.
 * Coordinates are object-local with origin at the center.
 */
import type { ShapeKind } from '@rcic/shared'

export function isConnectorKind(kind: string): boolean {
  return kind.startsWith('connector')
}

/** Regular polygon points, flat-top optional via startAngle. */
export function regularPolygon(n: number, rx: number, ry: number, startAngle = -Math.PI / 2): number[] {
  const pts: number[] = []
  for (let i = 0; i < n; i++) {
    const a = startAngle + (i * 2 * Math.PI) / n
    pts.push(Math.cos(a) * rx, Math.sin(a) * ry)
  }
  return pts
}

export function starPoints(spikes: number, rx: number, ry: number): number[] {
  const pts: number[] = []
  const step = Math.PI / spikes
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 1 : 0.45
    const a = -Math.PI / 2 + i * step
    pts.push(Math.cos(a) * rx * r, Math.sin(a) * ry * r)
  }
  return pts
}

export function burstPoints(spikes: number, rx: number, ry: number): number[] {
  const pts: number[] = []
  const step = Math.PI / spikes
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 1 : 0.62
    const a = -Math.PI / 2 + i * step
    pts.push(Math.cos(a) * rx * r, Math.sin(a) * ry * r)
  }
  return pts
}

/** Closed polygon (or empty) for filled kinds. Connectors return []. */
export function shapePolygon(kind: string, w: number, h: number): number[] {
  const hw = w / 2
  const hh = h / 2
  switch (kind) {
    case 'ellipse':
    case 'ring':
    case 'terminus':
    case 'cylinder':
    case 'cylinderH':
    case 'cloud':
    case 'document':
    case 'folder':
    case 'multiDoc':
    case 'brace':
    case 'actor':
    case 'heart':
    case 'callout':
    case 'note':
    case 'connectorElbow':
    case 'connectorCurve':
    case 'connectorArrow':
    case 'connectorLine':
      return []
    case 'diamond':
    case 'decision':
      return [0, -hh, hw, 0, 0, hh, -hw, 0]
    case 'triangle':
      return [0, -hh, hw, hh, -hw, hh]
    case 'triangleDown':
      return [-hw, -hh, hw, -hh, 0, hh]
    case 'stadium':
      return []
    case 'pentagon':
      return regularPolygon(5, hw, hh)
    case 'octagon':
      return regularPolygon(8, hw * 0.95, hh * 0.95, Math.PI / 8)
    case 'hexagon':
    case 'preparation':
      return regularPolygon(6, hw, hh, 0)
    case 'plus':
    case 'cross': {
      const t = Math.min(hw, hh) * 0.32
      return [
        -t, -hh, t, -hh, t, -t, hw, -t, hw, t, t, t, t, hh, -t, hh, -t, t, -hw, t, -hw, -t, -t, -t,
      ]
    }
    case 'arrowLeft':
      return [hw, -hh * 0.35, -hw * 0.15, -hh * 0.35, -hw * 0.15, -hh, -hw, 0, -hw * 0.15, hh, -hw * 0.15, hh * 0.35, hw, hh * 0.35]
    case 'arrowRight':
      return [-hw, -hh * 0.35, hw * 0.15, -hh * 0.35, hw * 0.15, -hh, hw, 0, hw * 0.15, hh, hw * 0.15, hh * 0.35, -hw, hh * 0.35]
    case 'chevron':
      return [-hw, -hh, hw * 0.35, -hh, hw, 0, hw * 0.35, hh, -hw, hh, -hw * 0.35, 0]
    case 'star':
      return starPoints(5, hw, hh)
    case 'burst':
      return burstPoints(8, hw, hh)
    case 'parallelogram':
    case 'data': {
      const s = w * 0.18
      return [-hw + s, -hh, hw, -hh, hw - s, hh, -hw, hh]
    }
    case 'trapezoid': {
      const s = w * 0.18
      return [-hw + s, -hh, hw - s, -hh, hw, hh, -hw, hh]
    }
    case 'delay': {
      // D shape approx as polygon
      return [-hw, -hh, hw * 0.35, -hh, hw, 0, hw * 0.35, hh, -hw, hh]
    }
    case 'display': {
      const s = w * 0.18
      return [-hw + s, -hh, hw, -hh, hw, hh, -hw + s, hh, -hw, 0]
    }
    case 'manualInput': {
      const s = h * 0.28
      return [-hw, -hh + s, hw, -hh, hw, hh, -hw, hh]
    }
    case 'process':
    case 'rect':
    default:
      return [-hw, -hh, hw, -hh, hw, hh, -hw, hh]
  }
}

/** SVG path `d` for complex non-polygon shapes (local coords). */
export function shapeSvgPath(kind: string, w: number, h: number): string | null {
  const hw = w / 2
  const hh = h / 2
  switch (kind) {
    case 'ellipse':
    case 'terminus':
      return `M ${-hw} 0 A ${hw} ${hh} 0 1 0 ${hw} 0 A ${hw} ${hh} 0 1 0 ${-hw} 0 Z`
    case 'stadium': {
      const r = Math.min(hh, hw)
      return `M ${-hw + r} ${-hh} H ${hw - r} A ${r} ${r} 0 0 1 ${hw - r} ${hh} H ${-hw + r} A ${r} ${r} 0 0 1 ${-hw + r} ${-hh} Z`
    }
    case 'ring': {
      const ir = Math.min(hw, hh) * 0.45
      return (
        `M ${-hw} 0 A ${hw} ${hh} 0 1 0 ${hw} 0 A ${hw} ${hh} 0 1 0 ${-hw} 0 Z ` +
        `M ${-ir} 0 A ${ir} ${ir} 0 1 1 ${ir} 0 A ${ir} ${ir} 0 1 1 ${-ir} 0 Z`
      )
    }
    case 'cylinder': {
      const ey = Math.min(hh * 0.22, 18)
      return (
        `M ${-hw} ${-hh + ey} A ${hw} ${ey} 0 0 1 ${hw} ${-hh + ey} L ${hw} ${hh - ey} ` +
        `A ${hw} ${ey} 0 0 1 ${-hw} ${hh - ey} Z ` +
        `M ${-hw} ${-hh + ey} A ${hw} ${ey} 0 0 0 ${hw} ${-hh + ey}`
      )
    }
    case 'cylinderH': {
      const ex = Math.min(hw * 0.22, 18)
      return (
        `M ${-hw + ex} ${-hh} A ${ex} ${hh} 0 0 0 ${-hw + ex} ${hh} L ${hw - ex} ${hh} ` +
        `A ${ex} ${hh} 0 0 0 ${hw - ex} ${-hh} Z ` +
        `M ${-hw + ex} ${-hh} A ${ex} ${hh} 0 0 1 ${-hw + ex} ${hh}`
      )
    }
    case 'document': {
      const wave = hh * 0.18
      return `M ${-hw} ${-hh} H ${hw} V ${hh - wave} Q ${hw / 2} ${hh + wave} 0 ${hh - wave} Q ${-hw / 2} ${hh - wave * 3} ${-hw} ${hh - wave} Z`
    }
    case 'folder': {
      const tab = w * 0.35
      return `M ${-hw} ${-hh + 10} H ${-hw + tab} L ${-hw + tab + 12} ${-hh} H ${hw} V ${hh} H ${-hw} Z`
    }
    case 'multiDoc': {
      const o = 8
      return (
        `M ${-hw + o} ${-hh} H ${hw} V ${hh - o} H ${-hw + o} Z ` +
        `M ${-hw} ${-hh + o} H ${hw - o} V ${hh} H ${-hw} Z`
      )
    }
    case 'callout': {
      const t = 14
      return `M ${-hw} ${-hh} H ${hw} V ${hh - t} H ${-hw + 36} L ${-hw + 18} ${hh} L ${-hw + 28} ${hh - t} H ${-hw} Z`
    }
    case 'note': {
      const f = 22
      return `M ${-hw} ${-hh} H ${hw - f} L ${hw} ${-hh + f} V ${hh} H ${-hw} Z M ${hw - f} ${-hh} V ${-hh + f} H ${hw}`
    }
    case 'cloud': {
      return (
        `M ${-hw * 0.55} ${hh * 0.35} ` +
        `C ${-hw} ${hh * 0.35} ${-hw} ${-hh * 0.15} ${-hw * 0.55} ${-hh * 0.25} ` +
        `C ${-hw * 0.45} ${-hh} ${hw * 0.1} ${-hh} ${hw * 0.25} ${-hh * 0.35} ` +
        `C ${hw * 0.55} ${-hh * 0.85} ${hw} ${-hh * 0.4} ${hw * 0.85} ${hh * 0.05} ` +
        `C ${hw} ${hh * 0.55} ${hw * 0.4} ${hh * 0.7} ${0} ${hh * 0.55} ` +
        `C ${-hw * 0.2} ${hh * 0.75} ${-hw * 0.35} ${hh * 0.55} ${-hw * 0.55} ${hh * 0.35} Z`
      )
    }
    case 'heart': {
      return (
        `M 0 ${hh * 0.55} ` +
        `C ${-hw * 0.15} ${hh * 0.15} ${-hw} ${-hh * 0.1} ${-hw * 0.55} ${-hh * 0.55} ` +
        `C ${-hw * 0.15} ${-hh} ${0} ${-hh * 0.55} 0 ${-hh * 0.2} ` +
        `C 0 ${-hh * 0.55} ${hw * 0.15} ${-hh} ${hw * 0.55} ${-hh * 0.55} ` +
        `C ${hw} ${-hh * 0.1} ${hw * 0.15} ${hh * 0.15} 0 ${hh * 0.55} Z`
      )
    }
    case 'brace': {
      return (
        `M ${hw * 0.3} ${-hh} ` +
        `C ${-hw * 0.2} ${-hh} ${-hw * 0.2} ${-hh * 0.35} ${-hw * 0.6} 0 ` +
        `C ${-hw * 0.2} ${hh * 0.35} ${-hw * 0.2} ${hh} ${hw * 0.3} ${hh}`
      )
    }
    case 'actor': {
      const r = Math.min(hw, hh) * 0.28
      return (
        `M 0 ${-hh + r} m ${-r} 0 a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 ` +
        `M 0 ${-hh + r * 2} V ${hh * 0.15} M ${-hw * 0.85} ${-hh * 0.15} H ${hw * 0.85} ` +
        `M 0 ${hh * 0.15} L ${-hw * 0.7} ${hh} M 0 ${hh * 0.15} L ${hw * 0.7} ${hh}`
      )
    }
    case 'connectorLine':
      return `M ${-hw} 0 L ${hw} 0`
    case 'connectorArrow':
      return `M ${-hw} 0 L ${hw} 0 M ${hw - 14} ${-10} L ${hw} 0 L ${hw - 14} 10`
    case 'connectorElbow':
      return `M ${-hw} ${-hh * 0.6} H 0 V ${hh * 0.6} H ${hw} M ${hw - 14} ${hh * 0.6 - 10} L ${hw} ${hh * 0.6} L ${hw - 14} ${hh * 0.6 + 10}`
    case 'connectorCurve':
      return `M ${-hw} ${hh * 0.5} C ${-hw * 0.2} ${-hh} ${hw * 0.2} ${hh} ${hw} ${-hh * 0.3} M ${hw - 12} ${-hh * 0.3 - 10} L ${hw} ${-hh * 0.3} L ${hw - 14} ${-hh * 0.3 + 8}`
    default:
      return null
  }
}

export function shapeKindNeedsRoundRect(kind: string): boolean {
  return kind === 'rect' || kind === 'process' || kind === 'note'
}
