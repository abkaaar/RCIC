/**
 * shapes/catalog — searchable ShapeKind list for the Shapes modal (ISS-012).
 * Categories drive accordion sections; keywords power the search filter.
 */
import type { ShapeKind } from '@rcic/shared'

export type ShapeCategory = 'basic' | 'connectors' | 'flowchart' | 'advanced'

export interface ShapeDef {
  id: ShapeKind
  label: string
  category: ShapeCategory
  keywords: string
  w: number
  h: number
}

export const SHAPE_CATEGORIES: { id: ShapeCategory; label: string }[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'flowchart', label: 'Flowchart' },
  { id: 'advanced', label: 'Advanced' },
]

export const SHAPE_CATALOG: ShapeDef[] = [
  // Basic
  { id: 'rect', label: 'Rectangle', category: 'basic', keywords: 'box square', w: 160, h: 120 },
  { id: 'ellipse', label: 'Ellipse', category: 'basic', keywords: 'circle oval', w: 160, h: 120 },
  { id: 'diamond', label: 'Diamond', category: 'basic', keywords: 'rhombus', w: 140, h: 140 },
  { id: 'triangle', label: 'Triangle', category: 'basic', keywords: '', w: 160, h: 140 },
  { id: 'triangleDown', label: 'Triangle down', category: 'basic', keywords: 'inverted', w: 160, h: 140 },
  { id: 'stadium', label: 'Stadium', category: 'basic', keywords: 'pill capsule', w: 180, h: 80 },
  { id: 'pentagon', label: 'Pentagon', category: 'basic', keywords: '', w: 140, h: 140 },
  { id: 'octagon', label: 'Octagon', category: 'basic', keywords: 'stop', w: 140, h: 140 },
  { id: 'plus', label: 'Plus', category: 'basic', keywords: 'cross add', w: 120, h: 120 },
  { id: 'arrowLeft', label: 'Arrow left', category: 'basic', keywords: '', w: 160, h: 80 },
  { id: 'arrowRight', label: 'Arrow right', category: 'basic', keywords: '', w: 160, h: 80 },
  { id: 'chevron', label: 'Chevron', category: 'basic', keywords: 'arrow block', w: 160, h: 100 },
  { id: 'star', label: 'Star', category: 'basic', keywords: '', w: 140, h: 140 },
  { id: 'callout', label: 'Callout', category: 'basic', keywords: 'speech bubble comment', w: 180, h: 120 },

  // Connectors (enter connect mode — linked edges, not free-floating)
  { id: 'connectorElbow', label: 'Bent connector', category: 'connectors', keywords: 'elbow step corner link bent', w: 180, h: 120 },
  { id: 'connectorCurve', label: 'Curved connector', category: 'connectors', keywords: 'curve s bend link', w: 180, h: 100 },
  { id: 'connectorArrow', label: 'Straight arrow', category: 'connectors', keywords: 'arrow line link straight', w: 180, h: 60 },
  { id: 'connectorLine', label: 'Line', category: 'connectors', keywords: 'stroke link plain no arrow', w: 180, h: 40 },

  // Flowchart
  { id: 'process', label: 'Process', category: 'flowchart', keywords: 'rect box', w: 160, h: 100 },
  { id: 'decision', label: 'Decision', category: 'flowchart', keywords: 'diamond if', w: 140, h: 140 },
  { id: 'data', label: 'Data', category: 'flowchart', keywords: 'parallelogram io', w: 180, h: 100 },
  { id: 'parallelogram', label: 'Parallelogram', category: 'flowchart', keywords: 'slant', w: 180, h: 100 },
  { id: 'cylinder', label: 'Cylinder', category: 'flowchart', keywords: 'database db', w: 120, h: 160 },
  { id: 'cylinderH', label: 'Cylinder horizontal', category: 'flowchart', keywords: 'database', w: 180, h: 100 },
  { id: 'document', label: 'Document', category: 'flowchart', keywords: 'page wavy', w: 140, h: 160 },
  { id: 'folder', label: 'Folder', category: 'flowchart', keywords: '', w: 160, h: 120 },
  { id: 'multiDoc', label: 'Multiple documents', category: 'flowchart', keywords: 'stack pages', w: 160, h: 140 },
  { id: 'terminus', label: 'Terminator', category: 'flowchart', keywords: 'start end oval', w: 180, h: 80 },
  { id: 'delay', label: 'Delay', category: 'flowchart', keywords: 'wait bullet', w: 160, h: 100 },
  { id: 'preparation', label: 'Preparation', category: 'flowchart', keywords: 'hex setup', w: 160, h: 100 },
  { id: 'display', label: 'Display', category: 'flowchart', keywords: 'screen output', w: 180, h: 100 },
  { id: 'manualInput', label: 'Manual input', category: 'flowchart', keywords: 'slant top', w: 160, h: 100 },

  // Advanced
  { id: 'cloud', label: 'Cloud', category: 'advanced', keywords: 'weather', w: 180, h: 110 },
  { id: 'hexagon', label: 'Hexagon', category: 'advanced', keywords: '', w: 140, h: 140 },
  { id: 'cross', label: 'Cross', category: 'advanced', keywords: 'plus thick', w: 120, h: 120 },
  { id: 'brace', label: 'Brace', category: 'advanced', keywords: 'curly group', w: 80, h: 160 },
  { id: 'note', label: 'Note', category: 'advanced', keywords: 'sticky fold corner', w: 140, h: 160 },
  { id: 'actor', label: 'Actor', category: 'advanced', keywords: 'person stick uml', w: 80, h: 160 },
  { id: 'heart', label: 'Heart', category: 'advanced', keywords: 'love', w: 140, h: 130 },
  { id: 'ring', label: 'Ring', category: 'advanced', keywords: 'donut hollow', w: 140, h: 140 },
  { id: 'trapezoid', label: 'Trapezoid', category: 'advanced', keywords: '', w: 180, h: 100 },
  { id: 'burst', label: 'Burst', category: 'advanced', keywords: 'starburst badge', w: 140, h: 140 },
]

const BY_ID = new Map(SHAPE_CATALOG.map((s) => [s.id, s]))

export function shapeDefaults(kind: ShapeKind): { w: number; h: number } {
  const d = BY_ID.get(kind)
  return d ? { w: d.w, h: d.h } : { w: 160, h: 120 }
}

export function filterShapes(query: string): ShapeDef[] {
  const q = query.trim().toLowerCase()
  if (!q) return SHAPE_CATALOG
  return SHAPE_CATALOG.filter((s) => {
    const hay = `${s.label} ${s.keywords} ${s.id} ${s.category}`.toLowerCase()
    return hay.includes(q)
  })
}
