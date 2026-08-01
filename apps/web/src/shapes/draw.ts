/**
 * shapes/draw — paint a ShapeKind onto a Pixi Graphics (object-local, centered).
 */
import { Graphics } from 'pixi.js'
import { isConnectorKind, shapePolygon, shapeSvgPath } from './geometry'

function hexColor(color: string): number {
  const s = color.startsWith('#') ? color.slice(1) : color
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16)
  return Number.isFinite(n) ? n : 0x7c5cff
}

function strokeOnly(g: Graphics, color: number): void {
  g.stroke({ width: 3.5, color: 0x1f2430, alpha: 0.85 })
  // invisible fill for hit area via AABB — callers still use object w/h
  void color
}

/** Approximate SVG path with Graphics primitives for complex kinds. */
function drawComplex(g: Graphics, kind: string, w: number, h: number, fill: number): void {
  const hw = w / 2
  const hh = h / 2
  const stroke = { width: 2, color: 0x000000, alpha: 0.12 }

  switch (kind) {
    case 'ellipse':
    case 'terminus':
      g.ellipse(0, 0, hw, hh).fill(fill).stroke(stroke)
      return
    case 'stadium': {
      const r = Math.min(hh, hw)
      g.roundRect(-hw, -hh, w, h, r).fill(fill).stroke(stroke)
      return
    }
    case 'ring': {
      g.ellipse(0, 0, hw, hh).fill(fill).stroke(stroke)
      g.ellipse(0, 0, Math.min(hw, hh) * 0.45, Math.min(hw, hh) * 0.45).fill(0xf4f4f6)
      return
    }
    case 'cylinder': {
      const ey = Math.min(hh * 0.22, 18)
      g.rect(-hw, -hh + ey, w, h - ey * 2).fill(fill)
      g.ellipse(0, hh - ey, hw, ey).fill(fill).stroke(stroke)
      g.ellipse(0, -hh + ey, hw, ey).fill(fill).stroke(stroke)
      g.moveTo(-hw, -hh + ey).lineTo(-hw, hh - ey)
      g.moveTo(hw, -hh + ey).lineTo(hw, hh - ey)
      g.stroke(stroke)
      return
    }
    case 'cylinderH': {
      const ex = Math.min(hw * 0.22, 18)
      g.roundRect(-hw + ex * 0.3, -hh, w - ex * 0.6, h, 4).fill(fill).stroke(stroke)
      g.ellipse(-hw + ex, 0, ex, hh).fill(fill).stroke(stroke)
      g.ellipse(hw - ex, 0, ex, hh).stroke(stroke)
      return
    }
    case 'document': {
      const wave = hh * 0.18
      g.moveTo(-hw, -hh)
      g.lineTo(hw, -hh)
      g.lineTo(hw, hh - wave)
      g.quadraticCurveTo(hw / 2, hh + wave, 0, hh - wave)
      g.quadraticCurveTo(-hw / 2, hh - wave * 3, -hw, hh - wave)
      g.closePath()
      g.fill(fill).stroke(stroke)
      return
    }
    case 'folder': {
      const tab = w * 0.35
      g.moveTo(-hw, -hh + 10)
      g.lineTo(-hw + tab, -hh + 10)
      g.lineTo(-hw + tab + 12, -hh)
      g.lineTo(hw, -hh)
      g.lineTo(hw, hh)
      g.lineTo(-hw, hh)
      g.closePath()
      g.fill(fill).stroke(stroke)
      return
    }
    case 'multiDoc': {
      const o = 8
      g.rect(-hw + o, -hh, w - o, h - o).fill(fill).stroke(stroke)
      g.rect(-hw, -hh + o, w - o, h - o).fill(fill).stroke(stroke)
      return
    }
    case 'callout': {
      const t = 14
      g.moveTo(-hw, -hh)
      g.lineTo(hw, -hh)
      g.lineTo(hw, hh - t)
      g.lineTo(-hw + 36, hh - t)
      g.lineTo(-hw + 18, hh)
      g.lineTo(-hw + 28, hh - t)
      g.lineTo(-hw, hh - t)
      g.closePath()
      g.fill(fill).stroke(stroke)
      return
    }
    case 'note': {
      const f = 22
      g.moveTo(-hw, -hh)
      g.lineTo(hw - f, -hh)
      g.lineTo(hw, -hh + f)
      g.lineTo(hw, hh)
      g.lineTo(-hw, hh)
      g.closePath()
      g.fill(fill).stroke(stroke)
      g.moveTo(hw - f, -hh)
      g.lineTo(hw - f, -hh + f)
      g.lineTo(hw, -hh + f)
      g.stroke(stroke)
      return
    }
    case 'cloud': {
      g.ellipse(-hw * 0.35, hh * 0.1, hw * 0.4, hh * 0.45).fill(fill)
      g.ellipse(hw * 0.25, hh * 0.15, hw * 0.42, hh * 0.42).fill(fill)
      g.ellipse(0, -hh * 0.25, hw * 0.5, hh * 0.48).fill(fill)
      g.ellipse(-hw * 0.15, -hh * 0.05, hw * 0.55, hh * 0.5).fill(fill).stroke(stroke)
      return
    }
    case 'heart': {
      // two circles + triangle approx
      const r = Math.min(hw, hh) * 0.42
      g.circle(-r * 0.7, -hh * 0.25, r).fill(fill)
      g.circle(r * 0.7, -hh * 0.25, r).fill(fill)
      g.poly([0, hh * 0.75, -hw * 0.95, -hh * 0.05, hw * 0.95, -hh * 0.05]).fill(fill)
      g.stroke(stroke)
      return
    }
    case 'brace': {
      g.moveTo(hw * 0.3, -hh)
      g.quadraticCurveTo(-hw * 0.5, -hh * 0.5, -hw * 0.2, 0)
      g.quadraticCurveTo(-hw * 0.5, hh * 0.5, hw * 0.3, hh)
      g.stroke({ width: 3, color: 0x1f2430, alpha: 0.8 })
      return
    }
    case 'actor': {
      const r = Math.min(hw, hh) * 0.28
      g.circle(0, -hh + r, r).stroke({ width: 2.5, color: 0x1f2430, alpha: 0.85 })
      g.moveTo(0, -hh + r * 2)
      g.lineTo(0, hh * 0.15)
      g.moveTo(-hw * 0.85, -hh * 0.15)
      g.lineTo(hw * 0.85, -hh * 0.15)
      g.moveTo(0, hh * 0.15)
      g.lineTo(-hw * 0.7, hh)
      g.moveTo(0, hh * 0.15)
      g.lineTo(hw * 0.7, hh)
      g.stroke({ width: 2.5, color: 0x1f2430, alpha: 0.85 })
      return
    }
    case 'connectorLine':
      g.moveTo(-hw, 0).lineTo(hw, 0)
      strokeOnly(g, fill)
      return
    case 'connectorArrow':
      g.moveTo(-hw, 0).lineTo(hw, 0)
      g.moveTo(hw - 14, -10).lineTo(hw, 0).lineTo(hw - 14, 10)
      strokeOnly(g, fill)
      return
    case 'connectorElbow':
      g.moveTo(-hw, -hh * 0.6).lineTo(0, -hh * 0.6).lineTo(0, hh * 0.6).lineTo(hw, hh * 0.6)
      g.moveTo(hw - 14, hh * 0.6 - 10).lineTo(hw, hh * 0.6).lineTo(hw - 14, hh * 0.6 + 10)
      strokeOnly(g, fill)
      return
    case 'connectorCurve':
      g.moveTo(-hw, hh * 0.5)
      g.bezierCurveTo(-hw * 0.2, -hh, hw * 0.2, hh, hw, -hh * 0.3)
      g.moveTo(hw - 12, -hh * 0.3 - 10).lineTo(hw, -hh * 0.3).lineTo(hw - 14, -hh * 0.3 + 8)
      strokeOnly(g, fill)
      return
    default: {
      const path = shapeSvgPath(kind, w, h)
      if (path) {
        // fallback rounded rect if we failed to special-case
        g.roundRect(-hw, -hh, w, h, 10).fill(fill).stroke(stroke)
      }
    }
  }
}

export function drawShapeKind(g: Graphics, kind: string, w: number, h: number, color: string): void {
  const fill = hexColor(color)
  const stroke = { width: 2, color: 0x000000, alpha: 0.12 }
  const hw = w / 2
  const hh = h / 2

  if (isConnectorKind(kind)) {
    drawComplex(g, kind, w, h, fill)
    return
  }

  if (kind === 'rect' || kind === 'process') {
    g.roundRect(-hw, -hh, w, h, Math.min(12, w / 8, h / 8)).fill(fill).stroke(stroke)
    return
  }

  const poly = shapePolygon(kind, w, h)
  if (poly.length >= 6) {
    g.poly(poly).fill(fill).stroke(stroke)
    return
  }

  drawComplex(g, kind, w, h, fill)
}
