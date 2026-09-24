/** CanvasOps domain types — sandbox board + fixture gold labels. */

export type ObjectType = 'sticky' | 'text' | 'section' | 'shape' | 'other'

export interface Physics {
  enabled: boolean
  mode: string
  mass: number
}

export interface CanvasObject {
  id: string
  type: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
  z: number
  color: string
  physics: Physics
  data: Record<string, unknown>
  /** Soft-delete for sandbox dedupe (not hard-delete without --approve). */
  archived?: boolean
}

export interface BoardState {
  objects: CanvasObject[]
}

export interface GoldSpec {
  expectedClusters: string[]
  maxDuplicateResidual: number
  minActionItems: number
  mustHaveSections: boolean
  allowEmptyHandoff?: boolean
}

export interface Fixture {
  id: string
  name: string
  challenging?: boolean
  notes?: string
  board: BoardState
  gold: GoldSpec
}

export interface HandoffPack {
  fixtureId?: string
  generatedAt: string
  agent: 'baseline' | 'advanced'
  sections: { title: string; stickyIds: string[]; texts: string[] }[]
  actionItems: { text: string; sourceId?: string }[]
  archivedDuplicateIds: string[]
  summary: string
}

export interface VerifyResult {
  ok: boolean
  checks: { name: string; pass: boolean; detail: string }[]
}

export interface ScoreResult {
  pass: boolean
  score: number
  duplicateResidual: number
  actionItemCount: number
  clusterHits: number
  clusterExpected: number
  exportValid: boolean
  details: string[]
}

export interface TrajectoryEvent {
  t: number
  agent: string
  kind: 'instruction' | 'tool_call' | 'tool_result' | 'verify' | 'retry' | 'human_checkpoint' | 'decision' | 'final'
  name?: string
  input?: unknown
  output?: unknown
  message?: string
}
