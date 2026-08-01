/**
 * ShapeIcon — outline SVG preview for the Shapes modal grid.
 */
import type { ReactNode } from 'react'
import type { ShapeKind } from '@rcic/shared'
import { isConnectorKind, shapePolygon, shapeSvgPath } from './geometry'

export function ShapeIcon({ kind, size = 28 }: { kind: ShapeKind | string; size?: number }) {
  const strokeOnly = isConnectorKind(kind) || kind === 'actor' || kind === 'brace'
  const poly = shapePolygon(kind, 28, 24)
  const path = shapeSvgPath(kind, 28, 24)

  let inner: ReactNode
  if (poly.length >= 6) {
    const pts: string[] = []
    for (let i = 0; i < poly.length; i += 2) pts.push(`${poly[i]},${poly[i + 1]}`)
    inner = <polygon points={pts.join(' ')} />
  } else if (path) {
    inner = <path d={path} fillRule="evenodd" />
  } else {
    inner = <rect x={-14} y={-12} width={28} height={24} rx={2} />
  }

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="shape-icon-svg">
      <g
        transform="translate(20 20)"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={strokeOnly ? 1 : 1}
      >
        {inner}
      </g>
    </svg>
  )
}
