/**
 * Room — one board session: Yjs RoomStore + Pixi CanvasApp + Matter PhysicsWorld.
 * Kept mounted across in-app tab switches; `active` pauses ticker/input when hidden (ISS-011).
 * Camera is restored from sessionStorage after canvas init (ISS-008).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { Trash2 } from 'lucide-react'
import { defaultObject, defaultConnector, massFor, isConnectorShapeKind, shapeKindToConnectorStyle, isPortEndpoint, freeEndpoint, portEndpoint, type CanvasObject, type PeerUser, type PhysicsMode, type ShapeKind, type ConnectorStyle, type ConnectorEndpoint, type InkMode, type CommentReply } from '@rcic/shared'
import { CanvasApp, type Camera, type Tool } from './canvas/CanvasApp'
import { PhysicsWorld } from './canvas/PhysicsWorld'
import { RoomStore } from './sync/roomDoc'
import { AudioPlayer, AudioRecorder, processImageFile } from './media/media'
import { exportJSON, exportPNG, exportSVG } from './export/exporters'
import { buildTimeline, stateAt, type Timeline } from './replay/timeline'
import { getAccent } from './theme'
import { loadCamera, saveCamera } from './cameraStore'
import { shapeDefaults } from './shapes/catalog'
import { oppositeSide, portWorldPos, quickAddOffset, defaultMid, portOutDir, layoutConnector, bboxFromPoints } from './shapes/ports'
import { RoomChip } from './ui/RoomChip'
import { TopRightBar } from './ui/TopRightBar'
import { Toolbar } from './ui/Toolbar'
import { brainstormingTemplate, flowchartTemplate } from './ui/templates'
import { CodeEditor } from './ui/CodeEditor'
import { TableEditor } from './ui/TableEditor'
import { PollEditor } from './ui/PollEditor'
import { ShapesModal } from './ui/ShapesModal'
import { ZoomControls } from './ui/ZoomControls'
import { Minimap, type MinimapSnapshot } from './ui/Minimap'
import { SelectionPanel } from './ui/SelectionPanel'
import { CommentEditor } from './ui/CommentEditor'
import { CommentsPanel } from './ui/CommentsPanel'
import { SectionTitleEditor } from './ui/SectionTitleEditor'
import { TextEditor } from './ui/TextEditor'
import { ReplayBar } from './ui/ReplayBar'
import { JoinModal } from './ui/JoinModal'
import { AiPanel } from './ui/AiPanel'
import { InkToolbar } from './ui/InkToolbar'
import type { ConnState, Peer, Toast } from './ui/types'

const IDENTITY_KEY = 'rcic-identity'

function loadIdentity(): PeerUser | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (typeof v?.name === 'string' && typeof v?.color === 'string') return v
  } catch {
    /* ignore */
  }
  return null
}

interface Session {
  store: RoomStore
  canvas: CanvasApp
  physics: PhysicsWorld
  player: AudioPlayer
}

interface ReplayState {
  tl: Timeline
  t: number
  playing: boolean
  speed: number
}

let toastSeq = 0

export function Room({
  roomId,
  active = true,
  onRoomName,
  onCreateBoard,
  onCancelJoin,
}: {
  roomId: string
  active?: boolean
  onRoomName?(roomId: string, name: string): void
  onCreateBoard?(roomId: string, newBrowserTab: boolean): void
  onCancelJoin?(): void
}) {
  const [identity, setIdentity] = useState<PeerUser | null>(loadIdentity)
  const hostRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<Session | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef(new AudioRecorder())
  const replayRef = useRef<ReplayState | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const selectedIdsRef = useRef<string[]>([])
  const editingIdRef = useRef<string | null>(null)
  const knownPeersRef = useRef<Map<number, string>>(new Map())
  const onRoomNameRef = useRef(onRoomName)
  onRoomNameRef.current = onRoomName
  const activeRef = useRef(active)
  activeRef.current = active

  const [ready, setReady] = useState(false)
  const [tool, setToolState] = useState<Tool>('select')
  const [shapeKind, setShapeKindState] = useState<ShapeKind>('rect')
  const [shapesOpen, setShapesOpen] = useState(false)
  const [camera, setCameraState] = useState<Camera>({ x: 0, y: 0, scale: 1 })
  const [selected, setSelectedObj] = useState<CanvasObject | null>(null)
  const [selectedCount, setSelectedCount] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingObj, setEditingObj] = useState<CanvasObject | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [conn, setConn] = useState<ConnState>('connecting')
  const [roomName, setRoomName] = useState('Untitled board')
  const [createdAt, setCreatedAt] = useState<number | null>(null)
  const [physicsOn, setPhysicsOn] = useState(true)
  const [recording, setRecording] = useState(false)
  const [replay, setReplayState] = useState<ReplayState | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [commentDraftId, setCommentDraftId] = useState<string | null>(null)
  const [commentEditMode, setCommentEditMode] = useState<'create' | 'edit'>('create')
  const [comments, setComments] = useState<CanvasObject[]>([])
  const [sectionEditId, setSectionEditId] = useState<string | null>(null)
  const sectionEditIdRef = useRef<string | null>(null)
  const [inkMode, setInkMode] = useState<InkMode>('pen')
  const [inkWidth, setInkWidth] = useState<'thin' | 'thick'>('thin')
  const [inkColor, setInkColor] = useState('#1f2430')
  const [votingActive, setVotingActive] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [reactions, setReactions] = useState<{ id: string; emoji: string; x: number; y: number; t: number }[]>([])
  const clipboardRef = useRef<CanvasObject[]>([])
  const seenReactionsRef = useRef(new Map<number, number>())

  const setReplay = (r: ReplayState | null) => {
    replayRef.current = r
    setReplayState(r)
  }

  const pushToast = useCallback((text: string, actionLabel?: string, onAction?: () => void) => {
    const id = ++toastSeq
    setToasts((prev) => [...prev.slice(-4), { id, text, actionLabel, onAction }])
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500)
  }, [])

  // ---------- session lifecycle ----------

  useEffect(() => {
    if (!identity || !hostRef.current) return
    let cancelled = false
    const store = new RoomStore(roomId, identity)
    const canvas = new CanvasApp()
    canvas.setAccent(getAccent())
    canvas.setInkOptions('pen', 4, '#1f2430')
    const physics = new PhysicsWorld(store)
    const player = new AudioPlayer((id, playing) => canvas.setPlaying(id, playing))
    const session: Session = { store, canvas, physics, player }
    knownPeersRef.current = new Map()
    selectedIdRef.current = null
    editingIdRef.current = null

    const readPeers = (): Peer[] => {
      const out: Peer[] = []
      store.provider.awareness.getStates().forEach((s: Record<string, any>, id: number) => {
        if (id === store.provider.awareness.clientID || !s?.user) return
        out.push({
          id,
          name: s.user.name,
          color: s.user.color,
          cursor: s.cursor,
          viewport: s.viewport,
          selection: s.selection ?? null,
        })
      })
      return out
    }

    const refreshFromStore = (changedIds?: Set<string>) => {
      // Refresh charts linked to tables when the source table changes.
      if (!changedIds || [...changedIds].some((id) => id !== '__votes__' && id !== '__meta__')) {
        for (const o of store.getAll()) {
          if (o.type !== 'chart') continue
          const tid = typeof o.data.sourceTableId === 'string' ? o.data.sourceTableId : ''
          if (!tid) continue
          if (changedIds && !changedIds.has(tid) && !changedIds.has(o.id)) continue
          const table = store.get(tid)
          if (!table || table.type !== 'table') continue
          const cells = Array.isArray(table.data.cells) ? table.data.cells : []
          const labels = (cells[0] ?? []).slice(1).map(String)
          const values = cells.slice(1).map((row: string[]) => Number(row?.[1] ?? 0)).filter((n: number) => Number.isFinite(n))
          const nextLabels = labels.length ? labels : values.map((_: number, i: number) => `${i + 1}`)
          const nextValues = values.length ? values : [0]
          if (
            JSON.stringify(o.data.labels) === JSON.stringify(nextLabels) &&
            JSON.stringify(o.data.values) === JSON.stringify(nextValues)
          ) {
            continue
          }
          store.updateObject(o.id, { data: { ...o.data, labels: nextLabels, values: nextValues } })
        }
      }
      const all = store.getAll()
      canvas.setObjects(all, changedIds)
      physics.syncObjects(all, changedIds)
      const counts = new Map<string, number>()
      for (const o of all) counts.set(o.id, store.voteCount(o.id))
      canvas.setVoteCounts(counts)
      setComments(all.filter((o) => o.type === 'comment'))
      setVotingActive(store.getVoting().active)
      setIsOwner(store.isOwner())
      const selId = selectedIdRef.current
      if (selId && (!changedIds || changedIds.has(selId))) {
        setSelectedObj(store.get(selId))
      }
      const edId = editingIdRef.current
      if (edId && (!changedIds || changedIds.has(edId))) {
        setEditingObj(store.get(edId))
      }
    }

    const openEditor = (id: string) => {
      const obj = store.get(id)
      if (!obj) return
      if (obj.type === 'section') {
        sectionEditIdRef.current = id
        setSectionEditId(id)
        return
      }
      if (obj.type === 'comment') {
        setCommentsOpen(true)
        setCommentEditMode(String(obj.data.text ?? '').trim() ? 'edit' : 'create')
        setCommentDraftId(id)
        return
      }
      if (obj.type !== 'text' && obj.type !== 'sticky' && obj.type !== 'code' && obj.type !== 'table' && obj.type !== 'poll') return
      editingIdRef.current = id
      setEditingId(id)
      setEditingObj(obj)
      if (obj.type === 'text' || obj.type === 'sticky') canvas.setLabelHidden(id, true)
    }

    const selectObjects = (ids: string[]) => {
      selectedIdsRef.current = ids
      selectedIdRef.current = ids.length ? ids[ids.length - 1]! : null
      canvas.setSelectedIds(ids)
      const primary = selectedIdRef.current
      const primaryObj = primary ? store.get(primary) ?? null : null
      setSelectedObj(primaryObj)
      setSelectedCount(ids.length)
      store.provider.awareness.setLocalStateField('selection', primary)
      if (primaryObj?.type === 'comment') setCommentsOpen(true)
    }

    const deleteObjects = (ids: string[]) => {
      const doomed = new Set(ids)
      // Convert connector port ends to free when host is deleted (ISS-040).
      for (const o of store.getAll()) {
        if (o.type !== 'connector') continue
        const from = o.data.from as ConnectorEndpoint
        const to = o.data.to as ConnectorEndpoint
        let nextFrom = from
        let nextTo = to
        let patch = false
        if (isPortEndpoint(from) && doomed.has(from.objectId)) {
          const host = store.get(from.objectId)
          const p = host ? portWorldPos(host, from.side) : { x: o.x - o.w / 4, y: o.y }
          nextFrom = freeEndpoint(p.x, p.y)
          patch = true
        }
        if (isPortEndpoint(to) && doomed.has(to.objectId)) {
          const host = store.get(to.objectId)
          const p = host ? portWorldPos(host, to.side) : { x: o.x + o.w / 4, y: o.y }
          nextTo = freeEndpoint(p.x, p.y)
          patch = true
        }
        if (patch) {
          store.updateObject(o.id, { data: { ...o.data, from: nextFrom, to: nextTo } })
        }
      }
      for (const o of store.getAll()) {
        if (o.type !== 'comment' || !doomed.has(String(o.data.anchorId ?? ''))) continue
        store.updateObject(o.id, { data: { ...o.data, anchorId: undefined, anchorOffset: undefined } })
      }
      for (const id of doomed) store.deleteObject(id)
      selectObjects([])
    }

    const syncConnectorLayouts = () => {
      for (const o of store.getAll()) {
        if (o.type !== 'connector') continue
        const fromEp = o.data.from as ConnectorEndpoint
        const toEp = o.data.to as ConnectorEndpoint
        const from = isPortEndpoint(fromEp) ? store.get(fromEp.objectId) : undefined
        const to = isPortEndpoint(toEp) ? store.get(toEp.objectId) : undefined
        const layout = layoutConnector(o, from ?? undefined, to ?? undefined)
        if (!layout) continue
        const bb = bboxFromPoints(layout.points)
        store.updateObject(o.id, {
          x: bb.x,
          y: bb.y,
          w: bb.w,
          h: bb.h,
          data: { ...o.data, mid: layout.mid },
        })
      }
    }

    /** Keep anchored comments glued to hosts (ISS-021). */
    const localOffset = (host: CanvasObject, x: number, y: number) => {
      const dx = x - host.x
      const dy = y - host.y
      const cos = Math.cos(host.rotation)
      const sin = Math.sin(host.rotation)
      return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos }
    }

    const syncCommentAnchors = (skipIds?: Set<string>) => {
      for (const o of store.getAll()) {
        if (o.type !== 'comment') continue
        if (skipIds?.has(o.id)) continue
        const anchorId = typeof o.data.anchorId === 'string' ? o.data.anchorId : ''
        if (!anchorId) continue
        const host = store.get(anchorId)
        if (!host || host.type === 'comment' || host.type === 'connector' || host.type === 'section') {
          store.updateObject(o.id, { data: { ...o.data, anchorId: undefined, anchorOffset: undefined } })
          continue
        }
        const off = o.data.anchorOffset as { x: number; y: number } | undefined
        const ox = Number(off?.x ?? 0)
        const oy = Number(off?.y ?? 0)
        const cos = Math.cos(host.rotation)
        const sin = Math.sin(host.rotation)
        const nx = host.x + ox * cos - oy * sin
        const ny = host.y + ox * sin + oy * cos
        if (Math.abs(nx - o.x) > 0.5 || Math.abs(ny - o.y) > 0.5) {
          store.updateObject(o.id, { x: nx, y: ny })
        }
      }
    }

    const segmentDistance = (
      px: number,
      py: number,
      ax: number,
      ay: number,
      bx: number,
      by: number,
    ) => {
      const dx = bx - ax
      const dy = by - ay
      const len2 = dx * dx + dy * dy
      if (len2 < 1e-6) return Math.hypot(px - ax, py - ay)
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
      return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
    }

    // throttle viewport awareness + persist camera for tab switches
    let viewportTimer: number | null = null
    let cameraSaveTimer: number | null = null
    let pendingViewport: { x: number; y: number; w: number; h: number } | null = null
    const flushViewport = () => {
      viewportTimer = null
      if (pendingViewport) {
        store.provider.awareness.setLocalStateField('viewport', pendingViewport)
        pendingViewport = null
      }
    }

    // canvas -> room wiring
    canvas.cb = {
      onCamera: (cam) => {
        setCameraState(cam)
        pendingViewport = canvas.viewportWorldRect()
        if (viewportTimer == null) viewportTimer = window.setTimeout(flushViewport, 120)
        if (cameraSaveTimer == null) {
          cameraSaveTimer = window.setTimeout(() => {
            cameraSaveTimer = null
            saveCamera(roomId, canvas.camera)
          }, 300)
        }
      },
      onSelect: (ids) => selectObjects(ids),
      onToolShortcut: (t) => setTool(t),
      onCursor: (() => {
        let last = 0
        return (x: number, y: number) => {
          const now = performance.now()
          if (now - last < 40) return
          last = now
          store.provider.awareness.setLocalStateField('cursor', { x, y })
        }
      })(),
      onCreateAt: (t, x, y) => {
        const center = canvas.viewportCenterWorld()
        const px = Number.isFinite(x) ? x : center.x
        const py = Number.isFinite(y) ? y : center.y
        if (t === 'comment') {
          const user = identity!
          const obj = defaultObject(nanoid(8), 'comment', px, py, store.maxZ() + 1)
          obj.color = user.color
          obj.data.author = user.name
          obj.data.authorColor = user.color
          obj.data.text = ''
          const host = canvas.objectAt(px, py)
          if (host && host.type !== 'comment' && host.type !== 'connector' && host.type !== 'section') {
            obj.data.anchorId = host.id
            obj.data.anchorOffset = localOffset(host, px, py)
          }
          store.createObject(obj)
          setTool('select')
          selectObjects([obj.id])
          setCommentEditMode('create')
          setCommentDraftId(obj.id)
          setCommentsOpen(true)
          return
        }
        if (t === 'section') {
          const n = store.getAll().filter((o) => o.type === 'section').length + 1
          const obj = defaultObject(nanoid(8), 'section', px, py, store.maxZ() + 1)
          obj.data.title = `Section ${n}`
          store.createObject(obj)
          setTool('select')
          selectObjects([obj.id])
          return
        }
        const obj = defaultObject(
          nanoid(8),
          t === 'text' ? 'text' : t === 'sticky' ? 'sticky' : 'shape',
          px,
          py,
          store.maxZ() + 1,
        )
        if (t === 'shape') {
          const kind = canvas.pendingShapeKind
          const d = shapeDefaults(kind)
          obj.data.kind = kind
          obj.w = d.w
          obj.h = d.h
          obj.physics.mass = massFor(obj.w, obj.h)
        }
        store.createObject(obj)
        setTool('select')
        selectObjects([obj.id])
        if (obj.type === 'text' || obj.type === 'sticky') openEditor(obj.id)
      },
      onInkStroke: (points, mode, width, color) => {
        if (points.length === 0) return
        const minX = Math.min(...points.map((p) => p.x))
        const maxX = Math.max(...points.map((p) => p.x))
        const minY = Math.min(...points.map((p) => p.y))
        const maxY = Math.max(...points.map((p) => p.y))
        const cx = (minX + maxX) / 2
        const cy = (minY + maxY) / 2
        const obj = defaultObject(nanoid(8), 'ink', cx, cy, store.maxZ() + 1)
        obj.w = Math.max(24, maxX - minX + width)
        obj.h = Math.max(24, maxY - minY + width)
        obj.color = color
        obj.data = {
          mode,
          width,
          points: points.map((p) => ({ x: p.x - cx, y: p.y - cy })),
        }
        store.createObject(obj)
      },
      onEraseInk: (x, y, radius) => {
        for (const obj of store.getAll()) {
          if (obj.type !== 'ink') continue
          const pts = Array.isArray(obj.data.points) ? (obj.data.points as { x: number; y: number }[]) : []
          let hit = pts.length === 1 && Math.hypot(x - (obj.x + pts[0]!.x), y - (obj.y + pts[0]!.y)) <= radius
          for (let i = 1; !hit && i < pts.length; i++) {
            const a = pts[i - 1]!
            const b = pts[i]!
            hit =
              segmentDistance(x, y, obj.x + a.x, obj.y + a.y, obj.x + b.x, obj.y + b.y) <=
              radius + Number(obj.data.width ?? 4) / 2
          }
          if (hit) {
            for (const comment of store.getAll()) {
              if (comment.type !== 'comment' || comment.data.anchorId !== obj.id) continue
              store.updateObject(comment.id, {
                data: { ...comment.data, anchorId: undefined, anchorOffset: undefined },
              })
            }
            store.deleteObject(obj.id)
          }
        }
      },
      onMoveMany: (updates) => {
        const movedComments = new Set<string>()
        for (const u of updates) {
          store.updateObject(u.id, { x: u.x, y: u.y })
          physics.dragTo(u.id, u.x, u.y)
          const o = store.get(u.id)
          if (o?.type === 'comment' && typeof o.data.anchorId === 'string') {
            const host = store.get(String(o.data.anchorId))
            if (host) {
              store.updateObject(u.id, {
                data: { ...o.data, anchorOffset: localOffset(host, u.x, u.y) },
              })
              movedComments.add(u.id)
            }
          }
        }
        syncConnectorLayouts()
        syncCommentAnchors(movedComments)
      },
      onResize: (id, w, h, x, y) => {
        const cur = store.get(id)
        if (cur?.type === 'ink') {
          const ow = Math.max(1, cur.w)
          const oh = Math.max(1, cur.h)
          const scale = Math.min(w / ow, h / oh)
          const pts = Array.isArray(cur.data.points) ? (cur.data.points as { x: number; y: number }[]) : []
          const width = Math.max(1, Number(cur.data.width ?? 4) * scale)
          const scaled = pts.map((p) => ({ x: p.x * scale, y: p.y * scale }))
          let minX = Infinity
          let maxX = -Infinity
          let minY = Infinity
          let maxY = -Infinity
          for (const p of scaled) {
            minX = Math.min(minX, p.x)
            maxX = Math.max(maxX, p.x)
            minY = Math.min(minY, p.y)
            maxY = Math.max(maxY, p.y)
          }
          const nw = scaled.length ? Math.max(24, maxX - minX + width) : w
          const nh = scaled.length ? Math.max(24, maxY - minY + width) : h
          store.updateObject(id, {
            w: nw,
            h: nh,
            x,
            y,
            data: { ...cur.data, width, points: scaled },
            physics: { ...cur.physics, enabled: false, mass: 1 },
          })
          syncConnectorLayouts()
          syncCommentAnchors()
          return
        }
        store.updateObject(id, {
          w,
          h,
          x,
          y,
          physics: { ...(cur?.physics ?? { enabled: true, mode: 'normal' as const, mass: 1 }), mass: massFor(w, h) },
        })
        syncConnectorLayouts()
        syncCommentAnchors()
      },
      onRotate: (id, rotation) => {
        store.updateObject(id, { rotation })
        syncConnectorLayouts()
        syncCommentAnchors()
      },
      onDragEnd: (id, vx, vy) => {
        const obj = store.get(id)
        if (!obj) return
        if (obj.type === 'comment') {
          const host = canvas.objectAt(obj.x, obj.y, obj.id)
          const canAnchor =
            host && host.type !== 'comment' && host.type !== 'connector' && host.type !== 'section'
          store.updateObject(obj.id, {
            data: {
              ...obj.data,
              anchorId: canAnchor ? host.id : undefined,
              anchorOffset: canAnchor ? localOffset(host, obj.x, obj.y) : undefined,
            },
          })
        }
        if (obj.physics.enabled && physics.enabled) {
          const speed = Math.hypot(vx, vy)
          if (speed > 100) physics.throwObject(id, vx, vy)
          else physics.settle(id)
        }
        // Skip store snap while physics still owns the body (ISS-029)
        if (!physics.isOwned(id)) canvas.ensureVisible(id)
        syncConnectorLayouts()
        syncCommentAnchors()
      },
      onObjectTap: (id) => {
        const obj = store.get(id)
        // Board-wide sticky voting — skip polls (they have their own option votes).
        if (
          store.getVoting().active &&
          obj &&
          obj.type !== 'connector' &&
          obj.type !== 'ink' &&
          obj.type !== 'poll'
        ) {
          store.toggleVote(id)
          return
        }
        if (obj?.type === 'audio' && obj.data.src) player.toggle(id, String(obj.data.src))
      },
      onObjectDoubleTap: (id) => openEditor(id),
      onDeleteKey: (ids) => deleteObjects(ids),
      onQuickConnect: (fromId, side, style) => {
        const from = store.get(fromId)
        if (!from || from.type === 'connector') return
        const kind = (from.type === 'shape' ? String(from.data.kind ?? 'rect') : 'rect') as ShapeKind
        const d = shapeDefaults(kind)
        const off = quickAddOffset(side)
        const twin = defaultObject(nanoid(8), 'shape', from.x + off.x, from.y + off.y, store.maxZ() + 1)
        twin.w = from.type === 'shape' ? from.w : d.w
        twin.h = from.type === 'shape' ? from.h : d.h
        twin.color = from.color
        twin.data = { kind }
        twin.physics.mass = massFor(twin.w, twin.h)
        const toSide = oppositeSide(side)
        const connStyle = style ?? 'curve'
        const mid = defaultMid(
          portWorldPos(from, side),
          portWorldPos(twin, toSide),
          connStyle,
          portOutDir(from, side),
          portOutDir(twin, toSide),
        )
        const conn = defaultConnector(nanoid(8), connStyle, portEndpoint(fromId, side), portEndpoint(twin.id, toSide), store.maxZ() + 2, mid)
        const bb = bboxFromPoints(
          layoutConnector(conn, from, twin)?.points ?? [
            { x: from.x, y: from.y },
            { x: twin.x, y: twin.y },
          ],
        )
        conn.x = bb.x
        conn.y = bb.y
        conn.w = bb.w
        conn.h = bb.h
        store.createObject(twin)
        store.createObject(conn)
        selectObjects([twin.id])
      },
      onConnectStroke: (fromEp, toEp, style) => {
        const fromHost = isPortEndpoint(fromEp) ? store.get(fromEp.objectId) ?? undefined : undefined
        const toHost = isPortEndpoint(toEp) ? store.get(toEp.objectId) ?? undefined : undefined
        if (isPortEndpoint(fromEp) && !fromHost) return
        if (isPortEndpoint(toEp) && !toHost) return
        const conn = defaultConnector(nanoid(8), style, fromEp, toEp, store.maxZ() + 1)
        const layout = layoutConnector(conn, fromHost, toHost)
        if (layout) {
          const bb = bboxFromPoints(layout.points)
          conn.x = bb.x
          conn.y = bb.y
          conn.w = bb.w
          conn.h = bb.h
          conn.data = { ...conn.data, mid: layout.mid }
        }
        store.createObject(conn)
        selectObjects([conn.id])
        // Stay in connect for free-free so users can keep drawing; select after port-port
        if (isPortEndpoint(fromEp) && isPortEndpoint(toEp)) setTool('select')
      },
      onConnectorMid: (id, mid) => {
        const o = store.get(id)
        if (!o || o.type !== 'connector') return
        store.updateObject(id, { data: { ...o.data, mid } })
        syncConnectorLayouts()
      },
    }
    canvas.localOverride = (id) => physics.getOwnedPosition(id)
    physics.onRelease = (id) => {
      canvas.ensureVisible(id)
    }
    canvas.onTickHook = (dt) => {
      if (!replayRef.current) physics.tick(dt)
    }

    // store -> canvas/physics
    const knownObjectIds = new Set(store.getAll().map((o) => o.id))

    const resolveCreatorName = (objectId: string, obj: CanvasObject): string => {
      // Comments / sticky notes may carry author on the payload
      const dataAuthor = typeof obj.data.author === 'string' ? obj.data.author.trim() : ''
      if (dataAuthor) return dataAuthor

      // History create events store Yjs client id as `u`
      let clientKey = ''
      const hist = store.history.toArray()
      for (let i = hist.length - 1; i >= 0; i--) {
        const ev = hist[i]
        if (ev && ev.a === 'create' && ev.id === objectId && ev.u) {
          clientKey = String(ev.u)
          break
        }
      }
      if (clientKey) {
        const cid = Number(clientKey)
        if (Number.isFinite(cid)) {
          const st = store.provider.awareness.getStates().get(cid) as { user?: { name?: string } } | undefined
          if (st?.user?.name) return String(st.user.name)
        }
        // Fall back to knownPeers map (client id → name)
        const fromKnown = knownPeersRef.current.get(cid)
        if (fromKnown) return fromKnown
      }

      // Last resort: peer who currently has this object selected
      for (const p of readPeers()) {
        if (p.selection === objectId && p.name) return p.name
      }
      return 'Someone'
    }

    const unsub = store.subscribe((change) => {
      // Own physics pose echoes: Matter already has the truth — skip O(N) syncObjects (ISS-052).
      const onlyOwnPhysicsEcho =
        change.physicsLocal &&
        change.changedIds.size > 0 &&
        [...change.changedIds].every((id) => physics.isOwned(id))
      if (onlyOwnPhysicsEcho) {
        canvas.setObjects(store.getAll(), change.changedIds)
      } else {
        refreshFromStore(change.changedIds)
      }
      if (change.remote) {
        physics.onRemoteChange(change.changedIds)
        // remote creates outside our viewport → jump toast
        for (const id of change.changedIds) {
          if (knownObjectIds.has(id)) continue
          const obj = store.get(id)
          if (!obj) continue
          knownObjectIds.add(id)
          const vp = canvas.viewportWorldRect()
          const inView =
            obj.x > vp.x && obj.x < vp.x + vp.w && obj.y > vp.y && obj.y < vp.y + vp.h
          if (!inView) {
            const label = obj.type === 'sticky' ? 'sticky' : obj.type
            const show = () => {
              const latest = store.get(id) ?? obj
              const who = resolveCreatorName(id, latest)
              pushToast(`${who} added a ${label}`, 'Show', () => {
                sessionRef.current?.canvas.centerOn(latest.x, latest.y)
              })
            }
            // History create (`u`) often arrives in the next sync tick after the object map
            if (resolveCreatorName(id, obj) !== 'Someone') show()
            else window.setTimeout(show, 50)
          }
        }
      } else {
        for (const id of change.changedIds) knownObjectIds.add(id)
      }
      // drop deleted ids
      for (const id of [...knownObjectIds]) {
        if (!store.get(id)) knownObjectIds.delete(id)
      }
    })

    // meta: room name, createdAt, physics toggle
    const onMeta = () => {
      const name = String(store.meta.get('name') ?? 'Untitled board')
      setRoomName(name)
      onRoomNameRef.current?.(roomId, name)
      const c = store.meta.get('createdAt')
      setCreatedAt(typeof c === 'number' ? c : null)
      const p = store.meta.get('physicsEnabled') !== false
      setPhysicsOn(p)
      physics.enabled = p
    }
    store.meta.observe(onMeta)
    onMeta()

    // presence + join/leave toasts (debounced) + peer selection outlines
    let presenceSeeded = false
    let presenceMutedUntil = Date.now() + 1000
    let providerConnected = false
    const pendingLeaves = new Map<number, { name: string; timer: number }>()

    const onAwareness = () => {
      const list = readPeers()
      setPeers(list)
      canvas.updatePeers(
        list.filter((p) => p.cursor).map((p) => ({ id: p.id, name: p.name, color: p.color, x: p.cursor!.x, y: p.cursor!.y })),
      )
      canvas.setPeerSelections(
        list.filter((p) => p.selection).map((p) => ({ id: p.id, objectId: p.selection!, color: p.color })),
      )

      // Ephemeral peer reactions (ISS-048)
      store.provider.awareness.getStates().forEach((st: Record<string, any>, cid: number) => {
        if (cid === store.provider.awareness.clientID) return
        const r = st?.reaction as { emoji?: string; t?: number } | undefined
        if (!r?.emoji || !r.t) return
        if (seenReactionsRef.current.get(cid) === r.t) return
        seenReactionsRef.current.set(cid, r.t)
        const cur = st.cursor as { x?: number; y?: number } | undefined
        const sx = cur && typeof cur.x === 'number' ? (cur.x - canvas.camera.x) * canvas.camera.scale : window.innerWidth / 2
        const sy = cur && typeof cur.y === 'number' ? (cur.y - canvas.camera.y) * canvas.camera.scale : window.innerHeight / 2
        const id = `${cid}-${r.t}`
        setReactions((prev) => [...prev, { id, emoji: r.emoji!, x: sx, y: sy, t: r.t! }])
        window.setTimeout(() => setReactions((prev) => prev.filter((x) => x.id !== id)), 1200)
      })

      const known = knownPeersRef.current
      const next = new Map<number, string>()
      const rejoined = new Set<number>()
      for (const p of list) {
        if (!p.name) continue
        next.set(p.id, p.name)
        // cancel pending leave if they reappeared — do not treat as a fresh join
        const pending = pendingLeaves.get(p.id)
        if (pending) {
          clearTimeout(pending.timer)
          pendingLeaves.delete(p.id)
          rejoined.add(p.id)
        }
      }

      const allowToasts = presenceSeeded && providerConnected && Date.now() >= presenceMutedUntil
      if (allowToasts) {
        for (const p of list) {
          if (!known.has(p.id) && !rejoined.has(p.id)) pushToast(`${p.name} joined`)
        }
        for (const [id, name] of known) {
          if (next.has(id) || pendingLeaves.has(id)) continue
          const timer = window.setTimeout(() => {
            pendingLeaves.delete(id)
            // still gone after debounce?
            if (!knownPeersRef.current.has(id)) pushToast(`${name} left`)
          }, 2000)
          pendingLeaves.set(id, { name, timer })
        }
      }
      presenceSeeded = true
      knownPeersRef.current = next
    }
    store.provider.awareness.on('change', onAwareness)

    // connection status
    const onStatus = ({ status }: { status: string }) => {
      providerConnected = status === 'connected'
      setConn(status === 'connected' ? 'live' : 'offline')
      if (status !== 'connected') presenceMutedUntil = Date.now() + 1500
    }
    // Restore pan/zoom only after Pixi init so init()'s default camera cannot clobber it (ISS-008/011)
    let didApplyCamera = false
    let canvasReady = false
    const tryApplyInitialCamera = () => {
      if (didApplyCamera || !canvasReady) return
      didApplyCamera = true
      const saved = loadCamera(roomId)
      if (saved) {
        canvas.applyCamera(saved)
        setCameraState(saved)
      } else if (store.getAll().length > 0) {
        canvas.fitToContent()
      }
    }

    const onSync = (synced: boolean) => {
      if (!synced) return
      setConn('live')
      providerConnected = true
      presenceMutedUntil = Date.now() + 1000
      tryApplyInitialCamera()
    }
    store.provider.on('status', onStatus)
    store.provider.on('sync', onSync)
    const onOffline = () => setConn('offline')
    window.addEventListener('offline', onOffline)

    const onBeforeUnload = () => {
      try {
        saveCamera(roomId, canvas.camera)
        store.provider.awareness.setLocalState(null)
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    void canvas
      .init(hostRef.current)
      .then(() => {
        if (cancelled) return
        sessionRef.current = session
        canvas.setActive(activeRef.current)
        refreshFromStore()
        canvasReady = true
        tryApplyInitialCamera()
        setReady(true)
      })
      .catch((err) => {
        console.error('canvas init failed', err)
        if (!cancelled) {
          sessionRef.current = session
          setReady(true)
        }
      })

    return () => {
      cancelled = true
      saveCamera(roomId, canvas.camera)
      sessionRef.current = null
      if (viewportTimer != null) clearTimeout(viewportTimer)
      if (cameraSaveTimer != null) clearTimeout(cameraSaveTimer)
      pendingLeaves.forEach((p) => clearTimeout(p.timer))
      pendingLeaves.clear()
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('beforeunload', onBeforeUnload)
      try {
        store.provider.awareness.setLocalState(null)
      } catch {
        /* ignore */
      }
      store.provider.awareness.off('change', onAwareness)
      store.meta.unobserve(onMeta)
      unsub()
      player.stop()
      physics.destroy()
      canvas.destroy()
      store.destroy()
      setReady(false)
      setPeers([])
      setSelectedObj(null)
      setEditingId(null)
      setEditingObj(null)
    }
  }, [roomId, identity, pushToast]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- replay playback ----------

  useEffect(() => {
    if (!replay?.playing) return
    const iv = setInterval(() => {
      const r = replayRef.current
      if (!r) return
      const nt = r.t + 50 * r.speed
      if (nt >= r.tl.t1) setReplay({ ...r, t: r.tl.t1, playing: false })
      else setReplay({ ...r, t: nt })
    }, 50)
    return () => clearInterval(iv)
  }, [replay?.playing]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = sessionRef.current
    if (!s) return
    if (replay) s.canvas.setReplay(stateAt(replay.tl, replay.t))
    else s.canvas.setReplay(null)
  }, [replay])

  // ---------- actions ----------

  const setTool = useCallback((t: Tool) => {
    setToolState(t)
    sessionRef.current?.canvas.setTool(t)
    if (t === 'select') setShapesOpen(false)
  }, [])

  const setShapeKind = useCallback((kind: ShapeKind) => {
    setShapeKindState(kind)
    sessionRef.current?.canvas.setPendingShapeKind(kind)
  }, [])

  const pickShape = useCallback(
    (kind: ShapeKind) => {
      const style = shapeKindToConnectorStyle(kind)
      if (style || isConnectorShapeKind(kind)) {
        const s = (style ?? 'curve') as ConnectorStyle
        setShapeKindState(kind)
        sessionRef.current?.canvas.setPendingConnectorStyle(s)
        setTool('connect')
        setShapesOpen(false)
        return
      }
      setShapeKind(kind)
      setTool('shape')
      setShapesOpen(false)
    },
    [setShapeKind, setTool],
  )

  // Pause inactive tab sessions without destroying them (ISS-011)
  useEffect(() => {
    sessionRef.current?.canvas.setActive(active)
  }, [active])

  // Sync identity across kept-alive Rooms (join once, all tabs can init)
  useEffect(() => {
    const onId = (e: Event) => {
      const u = (e as CustomEvent).detail as PeerUser | undefined
      if (u?.name && u?.color) {
        setIdentity(u)
        sessionRef.current?.store.setUser(u)
      }
    }
    const onClear = () => setIdentity(null)
    window.addEventListener('rcic-identity', onId)
    window.addEventListener('rcic-identity-clear', onClear)
    return () => {
      window.removeEventListener('rcic-identity', onId)
      window.removeEventListener('rcic-identity-clear', onClear)
    }
  }, [])

  useEffect(() => {
    if (!active || identity) return
    const id = loadIdentity()
    if (id) setIdentity(id)
  }, [active, identity])

  const withSession = (fn: (s: Session) => void) => {
    const s = sessionRef.current
    if (s) fn(s)
  }

  useEffect(() => {
    if (!active || !identity || !ready) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      withSession((s) => {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault()
          s.store.undo()
        } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault()
          s.store.redo()
        } else if (e.key === 'c') {
          const ids = selectedIdsRef.current
          const objs = ids.map((id) => s.store.get(id)).filter(Boolean) as CanvasObject[]
          clipboardRef.current = objs.map((o) => structuredClone(o))
          try {
            void navigator.clipboard.writeText(JSON.stringify(clipboardRef.current))
          } catch {
            /* ignore */
          }
        } else if (e.key === 'v' && clipboardRef.current.length) {
          e.preventDefault()
          const created: string[] = []
          for (const o of clipboardRef.current) {
            const copy = {
              ...structuredClone(o),
              id: nanoid(8),
              x: o.x + 32,
              y: o.y + 32,
              z: s.store.maxZ() + 1,
            }
            s.store.createObject(copy)
            created.push(copy.id)
          }
          if (created.length) {
            selectedIdsRef.current = created
            selectedIdRef.current = created[created.length - 1]!
            s.canvas.setSelectedIds(created)
            setSelectedObj(s.store.get(created[created.length - 1]!) ?? null)
            setSelectedCount(created.length)
          }
        }
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, identity, ready])

  const onJoin = (user: PeerUser) => {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(user))
    setIdentity(user)
    // Other mounted Rooms listen so they can init without remounting (ISS-011)
    window.dispatchEvent(new CustomEvent('rcic-identity', { detail: user }))
  }

  const onLogout = () => {
    try {
      sessionRef.current?.store.provider.awareness.setLocalState(null)
    } catch {
      /* ignore */
    }
    localStorage.removeItem(IDENTITY_KEY)
    setIdentity(null)
    setReady(false)
    window.dispatchEvent(new Event('rcic-identity-clear'))
  }

  const onImagePicked = async (file: File) => {
    const s = sessionRef.current
    if (!s) return
    try {
      const { src, w, h } = await processImageFile(file)
      const c = s.canvas.viewportCenterWorld()
      const x = Number.isFinite(c.x) ? c.x : 0
      const y = Number.isFinite(c.y) ? c.y : 0
      const obj = defaultObject(nanoid(8), 'image', x, y, s.store.maxZ() + 1)
      obj.w = w
      obj.h = h
      obj.data.src = src
      obj.physics.mass = massFor(w, h)
      s.store.createObject(obj)
    } catch (err) {
      console.error('image import failed', err)
    }
  }

  const onAudio = async () => {
    const s = sessionRef.current
    if (!s) return
    const rec = recorderRef.current
    if (rec.recording) {
      try {
        const { src, duration } = await rec.stop()
        const c = s.canvas.viewportCenterWorld()
        const obj = defaultObject(nanoid(8), 'audio', c.x, c.y, s.store.maxZ() + 1)
        obj.data = { src, duration }
        s.store.createObject(obj)
      } catch (err) {
        console.error('recording failed', err)
      }
      setRecording(false)
    } else {
      try {
        await rec.start(30)
        setRecording(true)
      } catch (err) {
        console.error('microphone unavailable', err)
      }
    }
  }

  const onExport = (format: 'png' | 'svg' | 'json') => {
    withSession((s) => {
      const objects = s.store.getAll()
      if (format === 'json') exportJSON(roomId, roomName, objects)
      else if (format === 'svg') exportSVG(objects, roomName)
      else if (s.canvas.app) {
        s.canvas.withAllVisible(() => exportPNG(s.canvas.app!, s.canvas.worldContainer, roomName))
      }
    })
  }

  const openReplay = () => {
    withSession((s) => {
      const tl = buildTimeline(
        s.store.history.toArray(),
        typeof s.store.meta.get('createdAt') === 'number' ? (s.store.meta.get('createdAt') as number) : null,
      )
      selectedIdRef.current = null
      editingIdRef.current = null
      setSelectedObj(null)
      setEditingId(null)
      setEditingObj(null)
      setReplay({ tl, t: tl.t0, playing: true, speed: 8 })
    })
  }

  const closeEditor = () => {
    if (editingId) sessionRef.current?.canvas.setLabelHidden(editingId, false)
    editingIdRef.current = null
    setEditingId(null)
    setEditingObj(null)
  }

  const applyInkOptions = (mode: InkMode, size: 'thin' | 'thick', color: string) => {
    const width =
      mode === 'highlighter'
        ? size === 'thin' ? 14 : 26
        : mode === 'eraser'
          ? size === 'thin' ? 14 : 28
          : size === 'thin' ? 4 : 9
    sessionRef.current?.canvas.setInkOptions(mode, width, color)
  }

  const getMinimapSnapshot = useCallback((): MinimapSnapshot | null => {
    const s = sessionRef.current
    if (!s || !s.canvas.app) return null
    const states: Peer[] = []
    s.store.provider.awareness.getStates().forEach((st: Record<string, any>, id: number) => {
      if (id === s.store.provider.awareness.clientID || !st?.user) return
      states.push({ id, name: st.user.name, color: st.user.color, cursor: st.cursor, viewport: st.viewport })
    })
    // Prefer physics override poses so minimap matches canvas (ISS-039).
    const objects = s.store.getAll().map((o) => {
      const ov = s.physics.getOwnedPosition(o.id)
      return ov ? { ...o, x: ov.x, y: ov.y, rotation: ov.rotation } : o
    })
    return { objects, viewport: s.canvas.viewportWorldRect(), peers: states }
  }, [])

  // ---------- render ----------

  return (
    <div className="room">
      <div ref={hostRef} className="canvas-host" />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void onImagePicked(f)
        }}
      />

      {!identity && <JoinModal onJoin={onJoin} onCancel={() => onCancelJoin?.()} />}

      {ready && identity && (
        <>
          <RoomChip
            name={roomName}
            conn={conn}
            onRename={(name) => withSession((s) => s.store.doc.transact(() => s.store.meta.set('name', name), 'rcic-ui'))}
            onCreateBoard={onCreateBoard}
          />

          <TopRightBar
            self={identity}
            peers={peers}
            createdAt={createdAt}
            onReplay={openReplay}
            onExport={onExport}
            onLogout={onLogout}
            onAccentChange={(color) => withSession((s) => s.canvas.setAccent(color))}
            onCursorColor={(color) => {
              const next = { ...identity, color }
              localStorage.setItem(IDENTITY_KEY, JSON.stringify(next))
              setIdentity(next)
              sessionRef.current?.store.setUser(next)
              window.dispatchEvent(new CustomEvent('rcic-identity', { detail: next }))
            }}
          />

          {!replay && (
            <Toolbar
              tool={tool}
              shapesOpen={shapesOpen}
              recording={recording}
              physicsOn={physicsOn}
              isOwner={isOwner}
              votingActive={votingActive}
              aiOpen={aiOpen}
              onToggleAi={() => setAiOpen((v) => !v)}
              onTool={(t) => {
                setTool(t)
                if (t !== 'shape') setShapesOpen(false)
              }}
              onOpenShapes={() => setShapesOpen((v) => !v)}
              onImage={() => fileRef.current?.click()}
              onAudio={() => void onAudio()}
              onTogglePhysics={() =>
                withSession((s) => s.store.doc.transact(() => s.store.meta.set('physicsEnabled', !physicsOn), 'rcic-ui'))
              }
              onSticker={(emoji) => {
                withSession((s) => {
                  const center = s.canvas.viewportCenterWorld()
                  const obj = defaultObject(nanoid(8), 'sticker', center.x, center.y, s.store.maxZ() + 1)
                  obj.data.emoji = emoji
                  s.store.createObject(obj)
                  setTool('select')
                  selectedIdsRef.current = [obj.id]
                  selectedIdRef.current = obj.id
                  s.canvas.setSelectedIds([obj.id])
                  setSelectedObj(obj)
                  setSelectedCount(1)
                })
              }}
              onInsert={(kind) => {
                withSession((s) => {
                  const center = s.canvas.viewportCenterWorld()
                  const obj = defaultObject(nanoid(8), kind, center.x, center.y, s.store.maxZ() + 1)
                  s.store.createObject(obj)
                  setTool('select')
                  selectedIdsRef.current = [obj.id]
                  selectedIdRef.current = obj.id
                  s.canvas.setSelectedIds([obj.id])
                  setSelectedObj(obj)
                  setSelectedCount(1)
                  if (kind === 'code' || kind === 'table' || kind === 'poll') {
                    editingIdRef.current = obj.id
                    setEditingId(obj.id)
                    setEditingObj(obj)
                  }
                })
              }}
              onTemplate={(kind) => {
                withSession((s) => {
                  const center = s.canvas.viewportCenterWorld()
                  const batch =
                    kind === 'brainstorm'
                      ? brainstormingTemplate(center.x, center.y, s.store.maxZ())
                      : flowchartTemplate(center.x, center.y, s.store.maxZ())
                  for (const o of batch) s.store.createObject(o)
                  setTool('select')
                })
              }}
              onVotingStart={() => withSession((s) => s.store.setVoting(true, true))}
              onVotingStop={() => withSession((s) => s.store.setVoting(false, false))}
              onVotingReset={() => withSession((s) => s.store.setVoting(s.store.getVoting().active, true))}
              onReaction={(emoji) => {
                withSession((s) => {
                  const cur = s.store.provider.awareness.getLocalState()?.cursor as { x?: number; y?: number } | undefined
                  const sx = cur && typeof cur.x === 'number' ? (cur.x - camera.x) * camera.scale : window.innerWidth / 2
                  const sy = cur && typeof cur.y === 'number' ? (cur.y - camera.y) * camera.scale : window.innerHeight / 2
                  const id = nanoid(6)
                  const t = Date.now()
                  s.store.provider.awareness.setLocalStateField('reaction', { emoji, t })
                  setReactions((prev) => [...prev, { id, emoji, x: sx, y: sy, t }])
                  window.setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 1200)
                  window.setTimeout(() => {
                    const st = s.store.provider.awareness.getLocalState()?.reaction as { t?: number } | undefined
                    if (st?.t === t) s.store.provider.awareness.setLocalStateField('reaction', null)
                  }, 1300)
                })
              }}
            />
          )}

          <div className="reaction-layer" aria-hidden>
            {reactions.map((r) => (
              <span key={r.id} className="reaction-float" style={{ left: r.x, top: r.y }}>
                {r.emoji}
              </span>
            ))}
          </div>
          {tool === 'ink' && !replay && (
            <InkToolbar
              mode={inkMode}
              width={inkWidth}
              color={inkColor}
              onMode={(mode) => {
                setInkMode(mode)
                applyInkOptions(mode, inkWidth, inkColor)
              }}
              onWidth={(width) => {
                setInkWidth(width)
                applyInkOptions(inkMode, width, inkColor)
              }}
              onColor={(color) => {
                setInkColor(color)
                applyInkOptions(inkMode, inkWidth, color)
              }}
            />
          )}

          {shapesOpen && !replay && (
            <ShapesModal
              selectedKind={shapeKind}
              onPick={pickShape}
              onClose={() => setShapesOpen(false)}
            />
          )}

          {replay && (
            <ReplayBar
              t0={replay.tl.t0}
              t1={replay.tl.t1}
              t={replay.t}
              playing={replay.playing}
              speed={replay.speed}
              onSeek={(t) => setReplay({ ...replay, t, playing: false })}
              onTogglePlay={() =>
                setReplay({ ...replay, playing: !replay.playing, t: replay.t >= replay.tl.t1 ? replay.tl.t0 : replay.t })
              }
              onSpeed={() => setReplay({ ...replay, speed: replay.speed === 1 ? 8 : replay.speed === 8 ? 32 : 1 })}
              onClose={() => setReplay(null)}
            />
          )}

          <div className="bottom-right">
            <Minimap getSnapshot={getMinimapSnapshot} onJump={(x, y) => withSession((s) => s.canvas.centerOn(x, y))} />
            <ZoomControls
              scale={camera.scale}
              onZoomIn={() => withSession((s) => s.canvas.zoomBy(1.25))}
              onZoomOut={() => withSession((s) => s.canvas.zoomBy(0.8))}
              onZoomReset={() => withSession((s) => s.canvas.zoomTo(1))}
              onZoomFit={() => withSession((s) => s.canvas.fitToContent())}
            />
          </div>

          {selectedCount > 1 && !replay && !editingId && (
            <div className="floating-panel selection-panel multi-selection-panel">
              <span className="multi-sel-label">{selectedCount} selected</span>
              <button
                className="icon-btn icon-danger"
                title="Delete"
                onClick={() =>
                  withSession((s) => {
                    s.canvas.cb.onDeleteKey?.([...selectedIdsRef.current])
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          )}

          {selected && selectedCount === 1 && !replay && !editingId && !sectionEditId && (
            <SelectionPanel
              obj={selected}
              camera={camera}
              onColor={(color) => withSession((s) => s.store.updateObject(selected.id, { color }))}
              onPhysics={(mode) =>
                withSession((s) => {
                  const obj = s.store.get(selected.id)
                  if (!obj) return
                  const physics =
                    mode === 'off'
                      ? { ...obj.physics, enabled: false }
                      : { ...obj.physics, enabled: true, mode: mode as PhysicsMode }
                  s.store.updateObject(selected.id, { physics })
                })
              }
              onRotate={(deg) =>
                withSession((s) => {
                  s.store.updateObject(selected.id, { rotation: (deg * Math.PI) / 180 })
                })
              }
              onChartType={(chartType) =>
                withSession((s) => {
                  const obj = s.store.get(selected.id)
                  if (!obj || obj.type !== 'chart') return
                  s.store.updateObject(selected.id, { data: { ...obj.data, chartType } })
                })
              }
              onDuplicate={() =>
                withSession((s) => {
                  const obj = s.store.get(selected.id)
                  if (!obj || obj.type === 'connector') return
                  const copy = { ...structuredClone(obj), id: nanoid(8), x: obj.x + 32, y: obj.y + 32, z: s.store.maxZ() + 1 }
                  s.store.createObject(copy)
                  selectedIdRef.current = copy.id
                  selectedIdsRef.current = [copy.id]
                  s.canvas.setSelectedIds([copy.id])
                  s.store.provider.awareness.setLocalStateField('selection', copy.id)
                  setSelectedObj(copy)
                  setSelectedCount(1)
                })
              }
              onDelete={() =>
                withSession((s) => {
                  s.canvas.cb.onDeleteKey?.([selected.id])
                })
              }
            />
          )}

          {sectionEditId && !replay && (
            <SectionTitleEditor
              obj={
                sessionRef.current?.store.get(sectionEditId) ??
                selected ?? {
                  id: sectionEditId,
                  type: 'section',
                  x: camera.x,
                  y: camera.y,
                  w: 480,
                  h: 320,
                  rotation: 0,
                  z: 0,
                  color: '#94a3b8',
                  physics: { enabled: false, mode: 'normal', mass: 1 },
                  data: { title: 'Section' },
                }
              }
              camera={camera}
              onCommit={(title) =>
                withSession((s) => {
                  const obj = s.store.get(sectionEditId)
                  if (obj) s.store.updateObject(sectionEditId, { data: { ...obj.data, title } })
                  sectionEditIdRef.current = null
                  setSectionEditId(null)
                })
              }
              onClose={() => {
                sectionEditIdRef.current = null
                setSectionEditId(null)
              }}
            />
          )}

          {editingId && editingObj && !replay && editingObj.type === 'text' && (
            <TextEditor
              obj={editingObj}
              camera={camera}
              onCommit={(payload) =>
                withSession((s) => {
                  const obj = s.store.get(editingId)
                  if (!obj) return
                  s.store.updateObject(editingId, {
                    h: payload.height,
                    data: {
                      ...obj.data,
                      text: payload.text,
                      html: payload.html,
                      fontSize: payload.fontSize,
                      fontFamily: payload.fontFamily,
                      align: payload.align,
                    },
                  })
                })
              }
              onClose={closeEditor}
            />
          )}
          {editingId && editingObj && !replay && editingObj.type === 'sticky' && (
            <TextEditor
              obj={editingObj}
              camera={camera}
              onCommit={(payload) =>
                withSession((s) => {
                  const obj = s.store.get(editingId)
                  if (!obj) return
                  s.store.updateObject(editingId, {
                    h: payload.height,
                    data: {
                      ...obj.data,
                      text: payload.text,
                      html: payload.html,
                      fontSize: payload.fontSize,
                      fontFamily: payload.fontFamily,
                      align: payload.align,
                    },
                  })
                })
              }
              onClose={closeEditor}
            />
          )}
          {editingId && editingObj && !replay && editingObj.type === 'code' && (
            <CodeEditor
              obj={editingObj}
              camera={camera}
              onCommit={(patch) =>
                withSession((s) => {
                  const obj = s.store.get(editingId)
                  if (!obj) return
                  s.store.updateObject(editingId, { data: { ...obj.data, ...patch } })
                })
              }
              onClose={closeEditor}
            />
          )}
          {editingId && editingObj && !replay && editingObj.type === 'table' && (
            <TableEditor
              obj={editingObj}
              camera={camera}
              onCommit={(patch) =>
                withSession((s) => {
                  const obj = s.store.get(editingId)
                  if (!obj) return
                  const next: Partial<typeof obj> = {
                    data: { ...obj.data, cols: patch.cols, rows: patch.rows, cells: patch.cells },
                  }
                  if (typeof patch.w === 'number') next.w = patch.w
                  if (typeof patch.h === 'number') next.h = patch.h
                  s.store.updateObject(editingId, next)
                })
              }
              onClose={closeEditor}
            />
          )}
          {editingId && editingObj && !replay && editingObj.type === 'poll' && identity && (
            <PollEditor
              obj={editingObj}
              camera={camera}
              userId={sessionRef.current?.store.userId ?? 'local'}
              onCommit={(data) =>
                withSession((s) => {
                  const obj = s.store.get(editingId)
                  if (!obj) return
                  const uid = s.store.userId
                  const prevVotes = (obj.data.votes ?? {}) as Record<string, Record<string, true>>
                  const incoming = (data.votes ?? prevVotes) as Record<string, Record<string, true>>
                  // Merge: keep other users' votes; apply only this client's choice from the editor.
                  const merged: Record<string, Record<string, true>> = {}
                  for (const [oid, map] of Object.entries(prevVotes)) {
                    const cleaned = { ...map }
                    delete cleaned[uid]
                    if (Object.keys(cleaned).length) merged[oid] = cleaned
                  }
                  for (const [oid, map] of Object.entries(incoming)) {
                    if (map?.[uid]) merged[oid] = { ...(merged[oid] ?? {}), [uid]: true }
                  }
                  // Drop votes for removed options
                  const optIds = new Set(
                    (Array.isArray(data.options) ? data.options : obj.data.options ?? []).map(
                      (o: { id?: string }) => String(o.id ?? ''),
                    ),
                  )
                  for (const oid of Object.keys(merged)) {
                    if (!optIds.has(oid)) delete merged[oid]
                  }
                  s.store.updateObject(editingId, {
                    data: {
                      ...obj.data,
                      question: data.question ?? obj.data.question,
                      options: data.options ?? obj.data.options,
                      votes: merged,
                    },
                  })
                })
              }
              onClose={closeEditor}
            />
          )}

          {commentDraftId && !replay && (
            <CommentEditor
              mode={commentEditMode}
              obj={
                sessionRef.current?.store.get(commentDraftId) ??
                selected ?? {
                  id: commentDraftId,
                  type: 'comment',
                  x: camera.x,
                  y: camera.y,
                  w: 36,
                  h: 44,
                  rotation: 0,
                  z: 0,
                  color: identity?.color ?? '#7c5cff',
                  physics: { enabled: false, mode: 'normal', mass: 1 },
                  data: { text: '', author: identity?.name ?? '', authorColor: identity?.color ?? '#7c5cff', replies: [] },
                }
              }
              camera={camera}
              onSubmit={(text) =>
                withSession((s) => {
                  const obj = s.store.get(commentDraftId)
                  if (!obj) return
                  if (commentEditMode === 'edit') {
                    s.store.updateObject(commentDraftId, {
                      data: { ...obj.data, text },
                    })
                  } else {
                    s.store.updateObject(commentDraftId, {
                      data: {
                        ...obj.data,
                        text,
                        author: identity?.name ?? obj.data.author,
                        authorColor: identity?.color ?? obj.color,
                      },
                    })
                  }
                  setCommentDraftId(null)
                  setCommentEditMode('create')
                  setCommentsOpen(true)
                })
              }
              onClose={() => {
                withSession((s) => {
                  const obj = s.store.get(commentDraftId)
                  if (obj && commentEditMode === 'create' && !String(obj.data.text ?? '').trim()) {
                    s.store.deleteObject(commentDraftId)
                  }
                })
                setCommentDraftId(null)
                setCommentEditMode('create')
              }}
            />
          )}

          {commentsOpen && !replay && identity && (
            <CommentsPanel
              comments={comments}
              activeId={selected?.type === 'comment' ? selected.id : commentDraftId}
              self={identity}
              onSelect={(id) => {
                withSession((s) => {
                  const obj = s.store.get(id)
                  if (!obj) return
                  selectedIdsRef.current = [id]
                  selectedIdRef.current = id
                  s.canvas.setSelectedIds([id])
                  s.canvas.centerOn(obj.x, obj.y)
                  setSelectedObj(obj)
                  setSelectedCount(1)
                })
              }}
              onEdit={(id) => {
                withSession((s) => {
                  const obj = s.store.get(id)
                  if (!obj || obj.type !== 'comment') return
                  if (String(obj.data.author ?? '') !== identity.name) return
                  selectedIdsRef.current = [id]
                  selectedIdRef.current = id
                  s.canvas.setSelectedIds([id])
                  setSelectedObj(obj)
                  setSelectedCount(1)
                  setCommentEditMode('edit')
                  setCommentDraftId(id)
                })
              }}
              onReply={(id, text) => {
                withSession((s) => {
                  const obj = s.store.get(id)
                  if (!obj || obj.type !== 'comment') return
                  const prev = Array.isArray(obj.data.replies) ? (obj.data.replies as CommentReply[]) : []
                  const reply: CommentReply = {
                    id: nanoid(8),
                    text,
                    author: identity.name,
                    authorColor: identity.color,
                    createdAt: Date.now(),
                  }
                  s.store.updateObject(id, { data: { ...obj.data, replies: [...prev, reply] } })
                })
              }}
              onResolve={(id) => {
                withSession((s) => {
                  const obj = s.store.get(id)
                  if (!obj || obj.type !== 'comment') return
                  s.store.updateObject(id, { data: { ...obj.data, resolved: true } })
                })
              }}
              onClose={() => setCommentsOpen(false)}
            />
          )}

          {aiOpen && !replay && identity && <AiPanel onClose={() => setAiOpen(false)} />}

          {recording && <div className="recording-banner">Recording audio… click the mic to finish</div>}
          {replay && <div className="replay-banner">Replaying session — editing paused</div>}
          {conn === 'offline' && <div className="offline-banner">You're offline — changes will sync when you reconnect</div>}

          <div className="toast-stack">
            {toasts.map((t) => (
              <div key={t.id} className="toast">
                <span>{t.text}</span>
                {t.actionLabel && t.onAction && (
                  <button
                    className="toast-action"
                    onClick={() => {
                      t.onAction?.()
                      setToasts((prev) => prev.filter((x) => x.id !== t.id))
                    }}
                  >
                    {t.actionLabel}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
