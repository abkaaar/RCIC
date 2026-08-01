/**
 * @rcic/shared — canvas object types and factories shared by web + server.
 * Object x/y are centers (Matter/Pixi agreement). Keep payloads JSON-serializable for Yjs maps.
 */
export type ObjectType =
  | 'text'
  | 'shape'
  | 'image'
  | 'sticky'
  | 'audio'
  | 'connector'
  | 'comment'
  | 'section'
  | 'ink'
  | 'sticker'
  | 'code'
  | 'poll'
  | 'table'
  | 'chart'

export type TextAlign = 'left' | 'center' | 'right'
export type InkMode = 'pen' | 'highlighter' | 'eraser'
export type CodeLanguage =
  | 'plain'
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'java'
  | 'cpp'
  | 'html'
  | 'css'
  | 'json'
export type ChartType = 'bar' | 'line' | 'pie' | 'doughnut'

export const CODE_LANGUAGES: { id: CodeLanguage; label: string }[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C++' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'json', label: 'JSON' },
]

export const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: 'bar', label: 'Bar' },
  { id: 'line', label: 'Line' },
  { id: 'pie', label: 'Pie' },
  { id: 'doughnut', label: 'Doughnut' },
]

/** Reply entry on a comment thread (ISS-031). */
export interface CommentReply {
  id: string
  text: string
  author: string
  authorColor: string
  createdAt: number
}

export const TEXT_FONTS = [
  { id: 'Inter', label: 'Inter' },
  { id: 'Georgia', label: 'Georgia' },
  { id: 'Space Grotesk', label: 'Space Grotesk' },
  { id: 'Merriweather', label: 'Merriweather' },
  { id: 'JetBrains Mono', label: 'JetBrains Mono' },
] as const

export const TEXT_SIZE_PRESETS = [
  { id: 'small', label: 'Small', size: 14 },
  { id: 'medium', label: 'Medium', size: 18 },
  { id: 'large', label: 'Large', size: 24 },
  { id: 'xl', label: 'Extra large', size: 32 },
  { id: 'huge', label: 'Huge', size: 48 },
] as const


/** Visual kind for type:'shape'. Catalog connector* icons enter connect mode (ISS-014). */
export type ShapeKind =
  | 'rect'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'triangleDown'
  | 'stadium'
  | 'pentagon'
  | 'octagon'
  | 'plus'
  | 'arrowLeft'
  | 'arrowRight'
  | 'chevron'
  | 'star'
  | 'callout'
  | 'connectorElbow'
  | 'connectorCurve'
  | 'connectorArrow'
  | 'connectorLine'
  | 'parallelogram'
  | 'cylinder'
  | 'cylinderH'
  | 'document'
  | 'folder'
  | 'process'
  | 'decision'
  | 'data'
  | 'multiDoc'
  | 'terminus'
  | 'delay'
  | 'preparation'
  | 'display'
  | 'manualInput'
  | 'cloud'
  | 'hexagon'
  | 'cross'
  | 'brace'
  | 'note'
  | 'actor'
  | 'heart'
  | 'ring'
  | 'trapezoid'
  | 'burst'

/** Linked connector stroke style (ISS-014). */
export type ConnectorStyle = 'elbow' | 'curve' | 'arrow' | 'line'
export type PortSide = 'n' | 'e' | 's' | 'w'

/** Linked or free connector endpoint (ISS-040). Legacy `{ objectId, side }` is treated as port. */
export type ConnectorEndpoint =
  | { kind: 'port'; objectId: string; side: PortSide }
  | { kind: 'free'; x: number; y: number }
  /** @deprecated prefer kind:'port' — still accepted for older boards */
  | { objectId: string; side: PortSide }

export function isPortEndpoint(
  ep: ConnectorEndpoint | null | undefined,
): ep is { kind?: 'port'; objectId: string; side: PortSide } {
  return !!ep && 'objectId' in ep && typeof ep.objectId === 'string' && 'side' in ep
}

export function isFreeEndpoint(ep: ConnectorEndpoint | null | undefined): ep is { kind: 'free'; x: number; y: number } {
  return !!ep && (ep as { kind?: string }).kind === 'free' && 'x' in ep && 'y' in ep
}

export function portEndpoint(objectId: string, side: PortSide): ConnectorEndpoint {
  return { kind: 'port', objectId, side }
}

export function freeEndpoint(x: number, y: number): ConnectorEndpoint {
  return { kind: 'free', x, y }
}

export type PhysicsMode = 'normal' | 'attract' | 'repel'

export interface ObjectPhysics {
  enabled: boolean
  mode: PhysicsMode
  mass: number
}

/** x/y is the CENTER of the object (matches the physics engine). */
export interface CanvasObject {
  id: string
  type: ObjectType
  x: number
  y: number
  w: number
  h: number
  rotation: number
  z: number
  color: string
  physics: ObjectPhysics
  /**
   * type-specific payload:
   *  text/sticky: { text, html?, fontSize?, fontFamily?, align? }
   *  shape:  { kind }
   *  image:  { src }
   *  audio:  { src, duration }
   *  connector: { style, from, to, mid? } — endpoints port or free (ISS-040)
   *  comment: { text, author, authorColor, resolved?, replies?: CommentReply[], anchorId?, anchorOffset? }
   *  section: { title }
   *  ink: { mode: 'pen' | 'highlighter', width, points: { x, y }[] }
   *  sticker: { emoji }
   *  code: { language, source }
   *  poll: { question, options: { id, label }[], votes: Record<optionId, Record<userId, true>> }
   *  table: { cols, rows, cells: string[][] }
   *  chart: { chartType, labels, values, sourceTableId? }
   */
  data: Record<string, any>
}

export interface HistoryEvent {
  t: number
  u: string
  a: 'create' | 'update' | 'delete'
  id: string
  /** full snapshot (create) */
  o?: CanvasObject
  /** partial patch (update) — heavy media excluded */
  p?: Partial<CanvasObject>
}

export interface PeerUser {
  name: string
  color: string
}

export const OBJECT_COLORS = [
  '#7c5cff',
  '#ff6b6b',
  '#ffb020',
  '#22c55e',
  '#38bdf8',
  '#f472b6',
  '#475569',
]

export const STICKY_COLORS = [
  '#ffd166',
  '#ffadad',
  '#a0c4ff',
  '#b9fbc0',
  '#ffc6ff',
  '#fdffb6',
]

export const USER_COLORS = [
  '#7c5cff',
  '#e11d48',
  '#f59e0b',
  '#16a34a',
  '#0ea5e9',
  '#d946ef',
  '#0d9488',
  '#f97316',
]

const ADJECTIVES = ['Swift', 'Cosmic', 'Mellow', 'Brave', 'Sunny', 'Quiet', 'Neon', 'Lucky', 'Fuzzy', 'Bold']
const ANIMALS = ['Otter', 'Fox', 'Panda', 'Heron', 'Lynx', 'Koala', 'Orca', 'Finch', 'Gecko', 'Yak']

export function randomName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const b = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  return `${a} ${b}`
}

export function randomUserColor(): string {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]
}

export function massFor(w: number, h: number): number {
  return Math.min(8, Math.max(0.5, (w * h) / 20000))
}

export function defaultObject(id: string, type: ObjectType, x: number, y: number, z: number): CanvasObject {
  const base: CanvasObject = {
    id,
    type,
    x,
    y,
    w: 160,
    h: 120,
    rotation: 0,
    z,
    color: OBJECT_COLORS[0],
    physics: { enabled: true, mode: 'normal', mass: 1 },
    data: {},
  }
  switch (type) {
    case 'text':
      base.w = 260
      base.h = 56
      base.color = '#1f2430'
      base.data = { text: '', html: '', fontSize: 28, fontFamily: 'Inter', align: 'left' }
      break
    case 'shape':
      base.w = 160
      base.h = 120
      base.color = OBJECT_COLORS[Math.floor(Math.random() * OBJECT_COLORS.length)]
      base.data = { kind: 'rect' }
      break
    case 'sticky':
      base.w = 180
      base.h = 180
      base.color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)]
      base.data = { text: '', html: '', fontSize: 20, fontFamily: 'Inter', align: 'left' }
      break
    case 'image':
      base.w = 320
      base.h = 240
      base.data = { src: '' }
      break
    case 'audio':
      base.w = 220
      base.h = 64
      base.color = OBJECT_COLORS[0]
      base.data = { src: '', duration: 0 }
      break
    case 'connector':
      base.w = 40
      base.h = 40
      base.color = '#64748b'
      base.physics = { enabled: false, mode: 'normal', mass: 1 }
      base.data = {
        style: 'curve' as ConnectorStyle,
        from: { kind: 'port', objectId: '', side: 'e' as PortSide },
        to: { kind: 'port', objectId: '', side: 'w' as PortSide },
      }
      break
    case 'comment':
      base.w = 36
      base.h = 44
      base.color = OBJECT_COLORS[0]
      base.physics = { enabled: false, mode: 'normal', mass: 1 }
      base.data = { text: '', author: '', authorColor: OBJECT_COLORS[0], resolved: false, replies: [] }
      break
    case 'section':
      base.w = 480
      base.h = 320
      base.color = '#94a3b8'
      base.physics = { enabled: false, mode: 'normal', mass: 1 }
      base.data = { title: 'Section 1' }
      break
    case 'ink':
      base.w = 24
      base.h = 24
      base.color = '#1f2430'
      base.physics = { enabled: false, mode: 'normal', mass: 1 }
      base.data = { mode: 'pen', width: 4, points: [] }
      break
    case 'sticker':
      base.w = 96
      base.h = 96
      base.color = '#ffffff'
      base.physics = { enabled: false, mode: 'normal', mass: 1 }
      base.data = { emoji: '⭐' }
      break
    case 'code':
      base.w = 420
      base.h = 240
      base.color = '#1e293b'
      base.physics = { enabled: false, mode: 'normal', mass: 1 }
      base.data = { language: 'javascript', source: '// hello\nconsole.log("hi")\n' }
      break
    case 'poll':
      base.w = 280
      base.h = 220
      base.color = '#ffffff'
      base.physics = { enabled: false, mode: 'normal', mass: 1 }
      base.data = {
        question: 'What do you think?',
        options: [
          { id: 'a', label: 'Option A' },
          { id: 'b', label: 'Option B' },
          { id: 'c', label: 'Option C' },
        ],
        votes: {},
      }
      break
    case 'table':
      base.w = 360
      base.h = 200
      base.color = '#ffffff'
      base.physics = { enabled: false, mode: 'normal', mass: 1 }
      base.data = {
        cols: 3,
        rows: 3,
        cells: [
          ['', '', ''],
          ['', '', ''],
          ['', '', ''],
        ],
      }
      break
    case 'chart':
      base.w = 320
      base.h = 240
      base.color = '#ffffff'
      base.physics = { enabled: false, mode: 'normal', mass: 1 }
      base.data = {
        chartType: 'bar' as ChartType,
        labels: ['A', 'B', 'C'],
        values: [3, 5, 2],
      }
      break
  }
  base.physics.mass = massFor(base.w, base.h)
  return base
}

export function shapeKindToConnectorStyle(kind: string): ConnectorStyle | null {
  switch (kind) {
    case 'connectorElbow':
      return 'elbow'
    case 'connectorCurve':
      return 'curve'
    case 'connectorArrow':
      return 'arrow'
    case 'connectorLine':
      return 'line'
    default:
      return null
  }
}

export function isConnectorShapeKind(kind: string): boolean {
  return shapeKindToConnectorStyle(kind) != null
}

/** Build a linked connector object; bbox is a placeholder until layout runs. */
export function defaultConnector(
  id: string,
  style: ConnectorStyle,
  from: ConnectorEndpoint,
  to: ConnectorEndpoint,
  z: number,
  mid?: { x: number; y: number },
): CanvasObject {
  const obj = defaultObject(id, 'connector', 0, 0, z)
  obj.data = { style, from, to, ...(mid ? { mid } : {}) }
  return obj
}
