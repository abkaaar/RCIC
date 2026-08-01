/**
 * RoomStore — Yjs document for one board: objects map, meta, history, awareness.
 * UI_ORIGIN / PHYSICS_ORIGIN mark local writes so subscribers can skip redundant work.
 * IndexedDB persistence enables offline merge when the websocket reconnects.
 */
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { IndexeddbPersistence } from 'y-indexeddb'
import type { CanvasObject, HistoryEvent, PeerUser } from '@rcic/shared'
import { WS_URL } from '../config'

export const UI_ORIGIN = 'rcic-ui'
export const PHYSICS_ORIGIN = 'rcic-physics'
const LOCAL_ORIGINS = new Set<unknown>([UI_ORIGIN, PHYSICS_ORIGIN])

const HISTORY_UPDATE_THROTTLE_MS = 350
const HISTORY_MAX = 6000

function finite(n: unknown, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

// ---------- sanitize ----------

/** Prevent flung objects from poisoning fitToContent / cameras (ISS-034). */
const COORD_CAP = 50_000

function clampCoord(n: number): number {
  return Math.max(-COORD_CAP, Math.min(COORD_CAP, n))
}

function sanitizePatch(patch: Partial<CanvasObject>): Partial<CanvasObject> {
  const out: Partial<CanvasObject> = { ...patch }
  if ('x' in out) out.x = clampCoord(finite(out.x, 0))
  if ('y' in out) out.y = clampCoord(finite(out.y, 0))
  if ('w' in out) out.w = Math.max(24, finite(out.w, 160))
  if ('h' in out) out.h = Math.max(24, finite(out.h, 120))
  if ('rotation' in out) out.rotation = finite(out.rotation, 0)
  if ('z' in out) out.z = finite(out.z, 0)
  return out
}

function sanitizeObject(obj: CanvasObject): CanvasObject {
  return {
    ...obj,
    x: clampCoord(finite(obj.x, 0)),
    y: clampCoord(finite(obj.y, 0)),
    w: Math.max(24, finite(obj.w, 160)),
    h: Math.max(24, finite(obj.h, 120)),
    rotation: finite(obj.rotation, 0),
    z: finite(obj.z, 0),
  }
}

export interface PhysicsClaim {
  client: string
  t: number
}

export interface StoreChange {
  changedIds: Set<string>
  remote: boolean
  /** True when this notification came from a local PHYSICS_ORIGIN write (ISS-052). */
  physicsLocal: boolean
}

/** Fields that are safe/small enough to put in update history events. */
const HISTORY_FIELDS: (keyof CanvasObject)[] = ['x', 'y', 'w', 'h', 'rotation', 'z', 'color', 'physics']

export class RoomStore {
  readonly doc: Y.Doc
  readonly objects: Y.Map<Y.Map<unknown>>
  readonly meta: Y.Map<unknown>
  readonly history: Y.Array<HistoryEvent>
  readonly votes: Y.Map<Y.Map<number>>
  /** Ephemeral simulation claims — last-write-wins; not undoable (ISS-052). */
  readonly physicsOwners: Y.Map<PhysicsClaim>
  readonly provider: WebsocketProvider
  readonly persistence: IndexeddbPersistence
  readonly userId: string
  readonly undoManager: Y.UndoManager

  private historyLast = new Map<string, number>()
  private listeners = new Set<(c: StoreChange) => void>()
  private claimListeners = new Set<(ids: Set<string>) => void>()

  // ---------- ctor / observers ----------

  constructor(readonly roomId: string, user: PeerUser) {
    this.doc = new Y.Doc()
    this.objects = this.doc.getMap('objects')
    this.meta = this.doc.getMap('meta')
    this.history = this.doc.getArray('history')
    this.votes = this.doc.getMap('votes')
    this.physicsOwners = this.doc.getMap('physicsOwners')
    this.persistence = new IndexeddbPersistence(`rcic-${roomId}`, this.doc)
    this.provider = new WebsocketProvider(WS_URL, roomId, this.doc, { connect: true })
    this.userId = String(this.doc.clientID)
    this.provider.awareness.setLocalStateField('user', user)
    // Only UI_ORIGIN is undoable — physics pose churn must not flood the stack.
    // captureTimeout merges keystrokes/drags within 500ms into one undo step.
    this.undoManager = new Y.UndoManager([this.objects, this.votes, this.meta], {
      trackedOrigins: new Set([UI_ORIGIN]),
      captureTimeout: 500,
    })

    const ensureMeta = () => {
      this.doc.transact(() => {
        if (this.meta.get('createdAt') == null) this.meta.set('createdAt', Date.now())
        if (this.meta.get('ownerId') == null) this.meta.set('ownerId', this.userId)
      }, UI_ORIGIN)
    }
    this.provider.on('sync', (synced: boolean) => {
      if (synced) ensureMeta()
    })
    this.persistence.once('synced', ensureMeta)

    this.objects.observeDeep((events, tr) => {
      const changedIds = new Set<string>()
      for (const e of events) {
        if (e.path.length === 0) {
          e.changes.keys.forEach((_v, key) => changedIds.add(key))
        } else {
          changedIds.add(String(e.path[0]))
        }
      }
      const change: StoreChange = {
        changedIds,
        remote: !LOCAL_ORIGINS.has(tr.origin),
        physicsLocal: tr.origin === PHYSICS_ORIGIN,
      }
      this.listeners.forEach((cb) => cb(change))
    })
    this.votes.observeDeep((_events, tr) => {
      if (LOCAL_ORIGINS.has(tr.origin)) {
        /* still notify for vote UI */
      }
      const change: StoreChange = {
        changedIds: new Set(['__votes__']),
        remote: !LOCAL_ORIGINS.has(tr.origin),
        physicsLocal: tr.origin === PHYSICS_ORIGIN,
      }
      this.listeners.forEach((cb) => cb(change))
    })
    this.meta.observe((_e, tr) => {
      const change: StoreChange = {
        changedIds: new Set(['__meta__']),
        remote: !LOCAL_ORIGINS.has(tr.origin),
        physicsLocal: tr.origin === PHYSICS_ORIGIN,
      }
      this.listeners.forEach((cb) => cb(change))
    })
    this.physicsOwners.observe((e) => {
      const ids = new Set<string>()
      e.changes.keys.forEach((_v, key) => ids.add(key))
      if (ids.size) this.claimListeners.forEach((cb) => cb(ids))
    })
  }

  isOwner(): boolean {
    return String(this.meta.get('ownerId') ?? '') === this.userId
  }

  undo(): void {
    this.undoManager.undo()
  }

  redo(): void {
    this.undoManager.redo()
  }

  // ---------- voting / undo helpers ----------

  getVoting(): { active: boolean; sessionId: string } {
    const v = this.meta.get('voting') as { active?: boolean; sessionId?: string } | undefined
    return { active: !!v?.active, sessionId: String(v?.sessionId ?? '') }
  }

  /**
   * Board-wide sticky voting (not poll-object votes).
   * New sessionId + clearing `votes` on start/reset so prior taps do not carry over.
   */
  setVoting(active: boolean, resetVotes: boolean): void {
    this.doc.transact(() => {
      const sessionId = active || resetVotes ? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` : this.getVoting().sessionId
      this.meta.set('voting', { active, sessionId })
      if (resetVotes || active) {
        const keys = Array.from(this.votes.keys())
        for (const k of keys) this.votes.delete(k)
      }
    }, UI_ORIGIN)
  }

  /** One vote per user per object — map key is userId. */
  toggleVote(objectId: string): void {
    if (!this.getVoting().active) return
    this.doc.transact(() => {
      let m = this.votes.get(objectId)
      if (!m) {
        m = new Y.Map<number>()
        this.votes.set(objectId, m)
      }
      if (m.has(this.userId)) m.delete(this.userId)
      else m.set(this.userId, 1)
    }, UI_ORIGIN)
  }

  voteCount(objectId: string): number {
    const m = this.votes.get(objectId)
    return m ? m.size : 0
  }

  // ---------- physics ownership claims (ISS-052) ----------

  getPhysicsClaim(objectId: string): PhysicsClaim | null {
    const v = this.physicsOwners.get(objectId)
    if (!v || typeof v !== 'object') return null
    const client = String((v as PhysicsClaim).client ?? '')
    const t = Number((v as PhysicsClaim).t ?? 0)
    if (!client || !Number.isFinite(t)) return null
    return { client, t }
  }

  setPhysicsClaim(objectId: string, client: string = this.userId): void {
    this.doc.transact(() => {
      this.physicsOwners.set(objectId, { client, t: Date.now() })
    }, PHYSICS_ORIGIN)
  }

  clearPhysicsClaim(objectId: string): void {
    const cur = this.getPhysicsClaim(objectId)
    if (!cur || cur.client !== this.userId) return
    this.doc.transact(() => {
      this.physicsOwners.delete(objectId)
    }, PHYSICS_ORIGIN)
  }

  subscribePhysicsClaims(cb: (ids: Set<string>) => void): () => void {
    this.claimListeners.add(cb)
    return () => this.claimListeners.delete(cb)
  }

  destroy(): void {
    this.undoManager.destroy()
    this.provider.destroy()
    this.persistence.destroy()
    this.doc.destroy()
  }

  /** Update local awareness identity (cursor color / name) without reconnecting. */
  setUser(user: PeerUser): void {
    this.provider.awareness.setLocalStateField('user', user)
  }

  subscribe(cb: (c: StoreChange) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  get(id: string): CanvasObject | null {
    const m = this.objects.get(id)
    if (!m) return null
    return sanitizeObject(Object.fromEntries(m.entries()) as unknown as CanvasObject)
  }

  getAll(): CanvasObject[] {
    const out: CanvasObject[] = []
    this.objects.forEach((m) => out.push(sanitizeObject(Object.fromEntries(m.entries()) as unknown as CanvasObject)))
    return out
  }

  maxZ(): number {
    let z = 0
    this.objects.forEach((m) => {
      const v = m.get('z')
      if (typeof v === 'number' && v > z) z = v
    })
    return z
  }

  // ---------- CRUD ----------

  createObject(obj: CanvasObject): void {
    const clean = sanitizeObject(obj)
    this.doc.transact(() => {
      this.objects.set(clean.id, new Y.Map(Object.entries(clean)))
    }, UI_ORIGIN)
    this.logEvent({ t: Date.now(), u: this.userId, a: 'create', id: clean.id, o: clean })
  }

  updateObject(id: string, patch: Partial<CanvasObject>, origin: string = UI_ORIGIN): void {
    const m = this.objects.get(id)
    if (!m) return
    const clean = sanitizePatch(patch)
    this.doc.transact(() => {
      for (const [k, v] of Object.entries(clean)) m.set(k, v)
    }, origin)
    this.logUpdate(id, clean)
  }

  /**
   * Batch pose writes from PhysicsWorld. Default PHYSICS_ORIGIN so UndoManager
   * ignores high-frequency simulation updates while remotes still apply them.
   */
  updateMany(items: { id: string; patch: Partial<CanvasObject> }[], origin: string = PHYSICS_ORIGIN): void {
    if (items.length === 0) return
    const cleaned = items.map(({ id, patch }) => ({ id, patch: sanitizePatch(patch) }))
    this.doc.transact(() => {
      for (const { id, patch } of cleaned) {
        const m = this.objects.get(id)
        if (!m) continue
        for (const [k, v] of Object.entries(patch)) m.set(k, v)
      }
    }, origin)
    for (const { id, patch } of cleaned) this.logUpdate(id, patch)
  }

  deleteObject(id: string): void {
    if (!this.objects.has(id)) return
    this.doc.transact(() => {
      this.objects.delete(id)
    }, UI_ORIGIN)
    this.logEvent({ t: Date.now(), u: this.userId, a: 'delete', id })
  }

  // ---------- history ----------

  private logUpdate(id: string, patch: Partial<CanvasObject>): void {
    const now = Date.now()
    const last = this.historyLast.get(id) ?? 0
    // Throttle per-id so ~20Hz physics writes do not explode the replay log.
    if (now - last < HISTORY_UPDATE_THROTTLE_MS) return
    this.historyLast.set(id, now)

    const p: Partial<CanvasObject> = {}
    for (const k of HISTORY_FIELDS) {
      if (k in patch) (p as Record<string, unknown>)[k] = patch[k]
    }
    // small text payloads are worth replaying; media (image/audio src) is not
    const obj = this.get(id)
    if ('data' in patch && obj && (obj.type === 'text' || obj.type === 'sticky' || obj.type === 'code' || obj.type === 'poll' || obj.type === 'table' || obj.type === 'chart')) {
      p.data = patch.data
    }
    if (Object.keys(p).length === 0) return
    this.logEvent({ t: now, u: this.userId, a: 'update', id, p })
  }

  private logEvent(ev: HistoryEvent): void {
    this.doc.transact(() => {
      this.history.push([ev])
      if (this.history.length > HISTORY_MAX) this.history.delete(0, this.history.length - HISTORY_MAX)
    }, UI_ORIGIN)
  }
}
