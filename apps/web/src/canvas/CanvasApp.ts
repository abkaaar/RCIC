/**
 * CanvasApp — PixiJS infinite canvas: camera, input, object views, culling.
 *
 * World coords are unbounded; the camera maps world → screen.
 * Object centers match Yjs/Matter. Frustum culling uses rendered root positions
 * (ISS-007) so store/render mismatches cannot hide in-view sprites permanently.
 */
import { Application, Container, Graphics, Rectangle, TilingSprite } from 'pixi.js'
import type { CanvasObject, ConnectorEndpoint, ConnectorStyle, InkMode, PortSide, ShapeKind } from '@rcic/shared'
import { freeEndpoint, isPortEndpoint, portEndpoint } from '@rcic/shared'
import { getAccent, hexToNumber } from '../theme'
import { ObjectView, visualZIndex } from './ObjectView'
import { CursorLayer, type PeerCursor } from './CursorLayer'
import {
  allPortSides,
  cornerWorld,
  layoutConnector,
  nearestPortSide,
  oppositeCorner,
  portWorldPos,
  previewConnectorPoints,
  quickAddOffset,
} from '../shapes/ports'

export interface Camera {
  /** world coordinate visible at screen (0,0) */
  x: number
  y: number
  scale: number
}

export type Tool = 'select' | 'hand' | 'shape' | 'text' | 'sticky' | 'connect' | 'comment' | 'section' | 'ink'

export interface PeerSelection {
  id: number
  objectId: string
  color: string
}

export interface CanvasCallbacks {
  onCamera(cam: Camera): void
  /** Empty array clears selection. Primary (last) id is last in the list. */
  onSelect(ids: string[]): void
  onCreateAt(tool: Tool, x: number, y: number): void
  onObjectTap(id: string): void
  onObjectDoubleTap(id: string): void
  onCursor(x: number, y: number): void
  onMoveMany(updates: { id: string; x: number; y: number }[]): void
  onResize(id: string, w: number, h: number, x: number, y: number): void
  onRotate(id: string, rotation: number): void
  onDragEnd(id: string, vx: number, vy: number): void
  onDeleteKey(ids: string[]): void
  onToolShortcut(tool: Tool): void
  /** Quick-add twin shape + connector from a port (ISS-014/037). */
  onQuickConnect(fromId: string, side: PortSide, style: ConnectorStyle): void
  /** Create connector between two endpoints (port and/or free) — ISS-040. */
  onConnectStroke(from: ConnectorEndpoint, to: ConnectorEndpoint, style: ConnectorStyle): void
  onConnectorMid(id: string, mid: { x: number; y: number }): void
  onInkStroke(points: { x: number; y: number }[], mode: Exclude<InkMode, 'eraser'>, width: number, color: string): void
  onEraseInk(x: number, y: number, radius: number): void
}

const MIN_SCALE = 0.05
const MAX_SCALE = 4
const WRITE_INTERVAL_MS = 33 // ~30Hz network flush during drag/resize
const TEXT_RES_DEBOUNCE_MS = 150
const HANDLE_HIT = 12
const PORT_HIT = 14
const CONNECT_SNAP_PX = 48
const QUICK_ADD_GAP = 220

function finiteSize(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 24
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-6) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function pointInQuad(
  px: number,
  py: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): boolean {
  const sign = (p1: { x: number; y: number }, p2: { x: number; y: number }) =>
    (px - p2.x) * (p1.y - p2.y) - (p1.x - p2.x) * (py - p2.y)
  const b1 = sign(a, b) < 0
  const b2 = sign(b, c) < 0
  const b3 = sign(c, d) < 0
  const b4 = sign(d, a) < 0
  return b1 === b2 && b2 === b3 && b3 === b4
}

interface DragState {
  mode:
    | 'pan'
    | 'maybe-pan'
    | 'maybe-drag'
    | 'drag'
    | 'resize'
    | 'rotate'
    | 'marquee'
    | 'create'
    | 'pinch'
    | 'port-drag'
    | 'mid-drag'
    | 'connect-pick'
    | 'ink-draw'
    | 'ink-erase'
  pointerId: number
  startSX: number
  startSY: number
  lastSX: number
  lastSY: number
  moved: boolean
  id?: string
  startX?: number
  startY?: number
  /** Group drag origins keyed by id */
  starts?: Map<string, { x: number; y: number }>
  corner?: 0 | 1 | 2 | 3
  portSide?: PortSide
  /** Free-space connect start (ISS-040) when not starting on a host port. */
  freeStart?: { x: number; y: number }
  connectFromId?: string
  samples: { t: number; x: number; y: number }[]
  shiftKey?: boolean
  inkPoints?: { x: number; y: number }[]
  /** Ink resize baseline so points scale from original stroke (ISS-030). */
  inkResize?: { w: number; h: number; width: number; points: { x: number; y: number }[] }
}

interface PinchState {
  a: number
  b: number
  dist: number
  midSX: number
  midSY: number
}

type PendingWrite =
  | { kind: 'move'; updates: { id: string; x: number; y: number }[] }
  | { kind: 'resize'; id: string; w: number; h: number; x: number; y: number }
  | { kind: 'rotate'; id: string; rotation: number }
  | { kind: 'connectorMid'; id: string; mid: { x: number; y: number } }

export class CanvasApp {
  app: Application | null = null
  camera: Camera = { x: 0, y: 0, scale: 1 }
  tool: Tool = 'select'
  /** Kind placed when tool === 'shape' (ISS-012). */
  pendingShapeKind: ShapeKind = 'rect'
  /** Stroke style when tool === 'connect'. */
  pendingConnectorStyle: ConnectorStyle = 'curve'
  pendingInkMode: InkMode = 'pen'
  pendingInkWidth = 4
  pendingInkColor = '#1f2430'
  /** Multi-select; last element is primary (ISS-013). */
  selectedIds: string[] = []
  replayMode = false

  /** hooks wired by the room */
  cb: Partial<CanvasCallbacks> = {}
  onTickHook: ((dtMs: number) => void) | null = null
  localOverride: ((id: string) => { x: number; y: number; rotation: number } | null) | null = null

  private host: HTMLElement | null = null
  private world = new Container()
  private overlay = new Graphics()
  private inkPreview = new Graphics()
  private peerOverlay = new Graphics()
  private grid: TilingSprite | null = null
  private cursors = new CursorLayer()
  private views = new Map<string, ObjectView>()
  private liveObjects = new Map<string, CanvasObject>()
  private replayObjects: CanvasObject[] | null = null
  private peerSelections: PeerSelection[] = []
  private drag: DragState | null = null
  private pinch: PinchState | null = null
  private pointers = new Map<number, { sx: number; sy: number }>()
  private lastTap: { id: string; t: number } | null = null
  private destroyed = false
  private cameraDirty = true
  private lastScreenW = 0
  private lastScreenH = 0
  private accent = hexToNumber(getAccent())
  private pendingWrite: PendingWrite | null = null
  private lastWriteAt = 0
  private textRes = 1
  private textResTimer: number | null = null
  private lastScaleForRes = 1
  /** When false (inactive board tab), skip input and pause the ticker (ISS-011). */
  private active = true
  private hoverPort: { id: string; side: PortSide } | null = null
  private connectFrom: { id: string; side: PortSide } | null = null
  private connectSnap: { id: string; side: PortSide } | null = null
  private marqueeWorld: { x0: number; y0: number; x1: number; y1: number } | null = null
  private rubberBand: { x: number; y: number } | null = null

  async init(host: HTMLElement): Promise<void> {
    this.host = host
    const app = new Application()
    await app.init({
      background: 0xf4f4f6,
      resizeTo: host,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    })
    if (this.destroyed) {
      app.destroy(true)
      return
    }
    this.app = app
    host.appendChild(app.canvas)
    app.canvas.style.touchAction = 'none'
    app.canvas.style.display = 'block'

    // dotted grid texture (64px tile, one dot)
    const dot = new Graphics().circle(32, 32, 2.2).fill(0xc4c6ce)
    const tex = app.renderer.generateTexture({ target: dot, frame: new Rectangle(0, 0, 64, 64), resolution: 2 })
    dot.destroy()
    this.grid = new TilingSprite({ texture: tex, width: app.screen.width, height: app.screen.height })

    this.world.sortableChildren = true
    this.inkPreview.zIndex = 999_999
    this.world.addChild(this.inkPreview)
    app.stage.addChild(this.grid, this.world, this.peerOverlay, this.overlay, this.cursors.root)

    // start with world origin centered
    this.camera = { x: -app.screen.width / 2, y: -app.screen.height / 2, scale: 1 }
    try {
      this.applyTextResolution(1)
    } catch {
      /* text resolution is optional at boot */
    }

    const canvas = app.canvas
    canvas.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('keydown', this.onKeyDown)

    app.ticker.add(() => this.tick(app.ticker.deltaMS))
  }

  destroy(): void {
    this.destroyed = true
    if (this.textResTimer) clearTimeout(this.textResTimer)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerUp)
    window.removeEventListener('keydown', this.onKeyDown)
    if (this.app) {
      this.app.canvas.removeEventListener('pointerdown', this.onPointerDown)
      this.app.canvas.removeEventListener('wheel', this.onWheel)
      this.app.destroy(true, { children: true })
      this.app = null
    }
    this.views.clear()
  }

  setAccent(hex: string): void {
    this.accent = hexToNumber(hex)
  }

  setPeerSelections(list: PeerSelection[]): void {
    this.peerSelections = list
  }

  // ---------- coordinates ----------

  private screenPos(e: { clientX: number; clientY: number }): { sx: number; sy: number } {
    const rect = this.app!.canvas.getBoundingClientRect()
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top }
  }

  worldFromScreen(sx: number, sy: number): { x: number; y: number } {
    return { x: sx / this.camera.scale + this.camera.x, y: sy / this.camera.scale + this.camera.y }
  }

  screenFromWorld(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - this.camera.x) * this.camera.scale, y: (wy - this.camera.y) * this.camera.scale }
  }

  viewportWorldRect(): { x: number; y: number; w: number; h: number } {
    const s = this.camera.scale
    return {
      x: this.camera.x,
      y: this.camera.y,
      w: (this.app?.screen.width ?? 0) / s,
      h: (this.app?.screen.height ?? 0) / s,
    }
  }

  viewportCenterWorld(): { x: number; y: number } {
    const r = this.viewportWorldRect()
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
  }

  // ---------- camera ----------

  private setCamera(x: number, y: number, scale: number): void {
    this.camera = { x, y, scale }
    this.cameraDirty = true
    if (Math.abs(scale - this.lastScaleForRes) > 0.001) {
      this.lastScaleForRes = scale
      this.scheduleTextResolution()
    }
  }

  private scheduleTextResolution(): void {
    if (this.textResTimer) clearTimeout(this.textResTimer)
    this.textResTimer = window.setTimeout(() => {
      this.textResTimer = null
      this.applyTextResolution(this.camera.scale)
    }, TEXT_RES_DEBOUNCE_MS)
  }

  private applyTextResolution(scale: number): void {
    const dpr = window.devicePixelRatio || 1
    const power = Math.ceil(Math.log2(Math.max(scale, 0.25)))
    const r = Math.min(8, Math.max(1, dpr * Math.pow(2, Math.max(0, power))))
    if (Math.abs(r - this.textRes) < 0.01) return
    this.textRes = r
    for (const v of this.views.values()) v.setTextResolution(r)
  }

  panBy(dsx: number, dsy: number): void {
    const s = this.camera.scale
    this.setCamera(this.camera.x + dsx / s, this.camera.y + dsy / s, s)
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const s0 = this.camera.scale
    const s1 = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s0 * factor))
    if (s1 === s0) return
    const w = this.worldFromScreen(sx, sy)
    this.setCamera(w.x - sx / s1, w.y - sy / s1, s1)
  }

  zoomBy(factor: number): void {
    if (!this.app) return
    this.zoomAt(this.app.screen.width / 2, this.app.screen.height / 2, factor)
  }

  zoomTo(scale: number): void {
    if (!this.app) return
    const c = this.viewportCenterWorld()
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
    this.setCamera(c.x - this.app.screen.width / 2 / s, c.y - this.app.screen.height / 2 / s, s)
  }

  centerOn(wx: number, wy: number): void {
    if (!this.app) return
    const s = this.camera.scale
    this.setCamera(wx - this.app.screen.width / 2 / s, wy - this.app.screen.height / 2 / s, s)
  }

  fitToContent(): void {
    if (!this.app) return
    const objs = this.currentObjects()
    if (objs.length === 0) {
      this.zoomTo(1)
      this.centerOn(0, 0)
      return
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const o of objs) {
      minX = Math.min(minX, o.x - o.w / 2)
      minY = Math.min(minY, o.y - o.h / 2)
      maxX = Math.max(maxX, o.x + o.w / 2)
      maxY = Math.max(maxY, o.y + o.h / 2)
    }
    const bw = Math.max(1, maxX - minX)
    const bh = Math.max(1, maxY - minY)
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(this.app.screen.width / bw, this.app.screen.height / bh) * 0.8))
    this.setCamera((minX + maxX) / 2 - this.app.screen.width / 2 / s, (minY + maxY) / 2 - this.app.screen.height / 2 / s, s)
  }

  // ---------- objects ----------

  setTool(tool: Tool): void {
    this.tool = tool
    if (this.app) {
      this.app.canvas.style.cursor = tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : 'crosshair'
    }
  }

  setPendingShapeKind(kind: ShapeKind): void {
    this.pendingShapeKind = kind
  }

  setPendingConnectorStyle(style: ConnectorStyle): void {
    this.pendingConnectorStyle = style
  }

  setInkOptions(mode: InkMode, width: number, color: string): void {
    this.pendingInkMode = mode
    this.pendingInkWidth = width
    this.pendingInkColor = color
  }

  get selectedId(): string | null {
    return this.selectedIds.length ? this.selectedIds[this.selectedIds.length - 1]! : null
  }

  /**
   * Pause rendering/input for inactive in-app tabs so multiple Rooms can stay mounted.
   * Avoids full remount jank when switching boards (ISS-011).
   */
  setActive(active: boolean): void {
    this.active = active
    if (!this.app) return
    if (active) {
      this.app.ticker.start()
      if (this.host) {
        const w = this.host.clientWidth
        const h = this.host.clientHeight
        if (w > 0 && h > 0) this.app.renderer.resize(w, h)
      }
      this.cameraDirty = true
    } else {
      this.app.ticker.stop()
      this.drag = null
      this.pinch = null
      this.pointers.clear()
    }
  }

  setSelected(id: string | null): void {
    this.selectedIds = id ? [id] : []
    if (id) this.ensureVisible(id)
  }

  setSelectedIds(ids: string[]): void {
    this.selectedIds = [...ids]
    const p = this.selectedId
    if (p) this.ensureVisible(p)
  }

  private emitSelect(ids: string[]): void {
    this.selectedIds = ids
    this.cb.onSelect?.(ids)
  }

  private isSelected(id: string): boolean {
    return this.selectedIds.includes(id)
  }

  /** Snap a view to the rendered pose (override if owned, else store) — ISS-007/029. */
  ensureVisible(id: string): void {
    const obj = this.liveObjects.get(id)
    const v = this.views.get(id)
    if (!obj || !v) return
    const ov = this.localOverride?.(id)
    if (ov) {
      v.tx = ov.x
      v.ty = ov.y
      v.trot = ov.rotation
      v.snap()
      v.root.visible = true
      return
    }
    v.snapToStore(obj)
  }

  /** World pose used for hit-test / handles — prefer physics override when present. */
  private poseOf(o: CanvasObject): { x: number; y: number; rotation: number; w: number; h: number } {
    const ov = this.localOverride?.(o.id)
    if (ov) return { x: ov.x, y: ov.y, rotation: ov.rotation, w: o.w, h: o.h }
    const v = this.views.get(o.id)
    if (v && (Math.abs(v.root.x - o.x) > 0.5 || Math.abs(v.root.y - o.y) > 0.5)) {
      return { x: v.root.x, y: v.root.y, rotation: v.root.rotation, w: o.w, h: o.h }
    }
    return { x: o.x, y: o.y, rotation: o.rotation, w: o.w, h: o.h }
  }

  /**
   * Replace live object map and reconcile Pixi views.
   * Pass changedIds for incremental updates (100+ object boards); omit for full sync.
   */
  setVoteCounts(counts: Map<string, number> | Record<string, number>): void {
    const get = (id: string) => (counts instanceof Map ? counts.get(id) : counts[id]) ?? 0
    for (const [id, v] of this.views) {
      v.setVoteCount(get(id))
    }
  }

  setObjects(list: CanvasObject[], changedIds?: Set<string>): void {
    const draggingId = this.activeDragId()
    const next = new Map(list.map((o) => [o.id, o]))
    // Preserve optimistic local transform for the object being dragged/resized
    if (draggingId && this.pendingWrite && (this.pendingWrite.kind === 'move' || this.pendingWrite.kind === 'resize')) {
      const live = this.liveObjects.get(draggingId)
      const storeObj = next.get(draggingId)
      if (live && storeObj) {
        if (this.pendingWrite.kind === 'move') {
          const u = this.pendingWrite.updates.find((m) => m.id === draggingId)
          if (u) next.set(draggingId, { ...storeObj, x: u.x, y: u.y })
        } else {
          next.set(draggingId, {
            ...storeObj,
            w: this.pendingWrite.w,
            h: this.pendingWrite.h,
            x: this.pendingWrite.x,
            y: this.pendingWrite.y,
          })
        }
      } else if (live) {
        next.set(draggingId, { ...live })
      }
    }
    // Preserve physics-owned poses so store refresh cannot yank sprites mid-sim (ISS-039).
    if (this.localOverride) {
      for (const [id, storeObj] of next) {
        const ov = this.localOverride(id)
        if (!ov) continue
        next.set(id, { ...storeObj, x: ov.x, y: ov.y, rotation: ov.rotation })
      }
    }
    this.liveObjects = next
    if (!this.replayMode) {
      const full = !changedIds || changedIds.size === 0 || changedIds.size > 40 || this.views.size === 0
      if (full) this.reconcile(Array.from(next.values()))
      else this.reconcileIncremental(next, changedIds)
    }
  }

  /** id of object currently being dragged or resized, if any */
  activeDragId(): string | null {
    const d = this.drag
    if (d && (d.mode === 'drag' || d.mode === 'resize' || d.mode === 'rotate' || d.mode === 'mid-drag') && d.id) return d.id
    return null
  }

  applyCamera(cam: Camera): void {
    this.setCamera(cam.x, cam.y, cam.scale)
  }

  setReplay(list: CanvasObject[] | null): void {
    this.replayObjects = list
    this.replayMode = list !== null
    if (this.replayMode) {
      this.selectedIds = []
      this.reconcile(list!, true)
    } else {
      this.reconcile(Array.from(this.liveObjects.values()), true)
    }
  }

  setPlaying(id: string, playing: boolean): void {
    this.views.get(id)?.setPlaying(playing)
  }

  setLabelHidden(id: string, hidden: boolean): void {
    this.views.get(id)?.setLabelHidden(hidden)
  }

  private currentObjects(): CanvasObject[] {
    return this.replayMode && this.replayObjects ? this.replayObjects : Array.from(this.liveObjects.values())
  }

  private reconcile(list: CanvasObject[], snapAll = false): void {
    const seen = new Set<string>()
    const draggingId = this.activeDragId()
    for (const obj of list) {
      seen.add(obj.id)
      let v = this.views.get(obj.id)
      if (!v) {
        v = new ObjectView(obj.id)
        v.setTextResolution(this.textRes)
        this.views.set(obj.id, v)
        this.world.addChild(v.root)
        v.update(obj, true)
      } else if (obj.id === draggingId) {
        const live = this.liveObjects.get(obj.id)
        if (live) v.update({ ...obj, x: live.x, y: live.y, w: live.w, h: live.h, rotation: live.rotation }, true)
      } else {
        v.update(obj, snapAll)
      }
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.world.removeChild(v.root)
        v.destroy()
        this.views.delete(id)
        if (this.isSelected(id)) {
          this.emitSelect(this.selectedIds.filter((x) => x !== id))
        }
      }
    }
  }

  /** Update only changed ids + remove missing — cheaper for large boards (ISS-010). */
  private reconcileIncremental(all: Map<string, CanvasObject>, changedIds: Set<string>): void {
    const draggingId = this.activeDragId()
    for (const id of changedIds) {
      const obj = all.get(id)
      if (!obj) {
        const v = this.views.get(id)
        if (v) {
          this.world.removeChild(v.root)
          v.destroy()
          this.views.delete(id)
          if (this.isSelected(id)) {
            this.emitSelect(this.selectedIds.filter((x) => x !== id))
          }
        }
        continue
      }
      let v = this.views.get(id)
      if (!v) {
        v = new ObjectView(id)
        v.setTextResolution(this.textRes)
        this.views.set(id, v)
        this.world.addChild(v.root)
        v.update(obj, true)
      } else if (id === draggingId) {
        const live = this.liveObjects.get(id)
        if (live) v.update({ ...obj, x: live.x, y: live.y, w: live.w, h: live.h, rotation: live.rotation }, true)
      } else {
        v.update(obj, false)
      }
    }
    // Drop views for objects removed without appearing in changedIds (rare)
    if (this.views.size > all.size) {
      for (const [id, v] of this.views) {
        if (!all.has(id)) {
          this.world.removeChild(v.root)
          v.destroy()
          this.views.delete(id)
        }
      }
    }
  }

  updatePeers(list: PeerCursor[]): void {
    this.cursors.update(list)
  }

  /** temporarily un-cull everything (used by PNG export) */
  withAllVisible<T>(fn: () => T): T {
    for (const v of this.views.values()) v.root.visible = true
    this.overlay.visible = false
    this.peerOverlay.visible = false
    try {
      return fn()
    } finally {
      this.overlay.visible = true
      this.peerOverlay.visible = true
      this.cameraDirty = true
    }
  }

  get worldContainer(): Container {
    return this.world
  }
  // ---------- hit testing ----------

  private hitTest(wx: number, wy: number, excludeId?: string, anchorHostOnly = false): CanvasObject | null {
    const objs = this.currentObjects()
      .filter(
        (o) =>
          o.type !== 'connector' &&
          o.id !== excludeId &&
          (!anchorHostOnly || (o.type !== 'comment' && o.type !== 'section')),
      )
      .slice()
      .sort((a, b) => visualZIndex(b) - visualZIndex(a))
    for (const o of objs) {
      const pose = this.poseOf(o)
      const dx = wx - pose.x
      const dy = wy - pose.y
      const cos = Math.cos(-pose.rotation)
      const sin = Math.sin(-pose.rotation)
      const lx = dx * cos - dy * sin
      const ly = dx * sin + dy * cos
      if (o.type === 'section') {
        // include title pill above top-left
        if (Math.abs(lx) <= o.w / 2 && ly >= -o.h / 2 - 36 && ly <= o.h / 2) return o
        continue
      }
      if (Math.abs(lx) <= o.w / 2 && Math.abs(ly) <= o.h / 2) return o
    }
    // connectors: hit near path mid / bbox
    for (const o of this.currentObjects()) {
      if (anchorHostOnly) break
      if (o.type !== 'connector' || o.id === excludeId) continue
      const pose = this.poseOf(o)
      if (Math.abs(wx - pose.x) <= o.w / 2 && Math.abs(wy - pose.y) <= o.h / 2) return o
    }
    return null
  }

  /** Public hit for create-time anchoring (comments). */
  objectAt(wx: number, wy: number, excludeId?: string): CanvasObject | null {
    return this.hitTest(wx, wy, excludeId, true)
  }

  /** Nearest connectable host within snap radius (ISS-037). */
  private nearestConnectTarget(wx: number, wy: number, excludeId?: string): CanvasObject | null {
    const hit = this.hitTest(wx, wy, excludeId)
    if (hit && hit.type !== 'connector' && hit.type !== 'comment' && hit.type !== 'section' && hit.type !== 'ink') {
      return hit
    }
    let best: CanvasObject | null = null
    let bestD = CONNECT_SNAP_PX / this.camera.scale
    for (const o of this.currentObjects()) {
      if (o.id === excludeId) continue
      if (o.type === 'connector' || o.type === 'comment' || o.type === 'section' || o.type === 'ink') continue
      const pose = this.poseOf(o)
      const d = Math.hypot(wx - pose.x, wy - pose.y) - Math.max(o.w, o.h) / 2
      if (d < bestD) {
        bestD = d
        best = o
      }
    }
    return best
  }

  private isConnectHost(o: CanvasObject): boolean {
    return (
      o.type === 'shape' ||
      o.type === 'sticky' ||
      o.type === 'text' ||
      o.type === 'image' ||
      o.type === 'sticker' ||
      o.type === 'audio' ||
      o.type === 'code' ||
      o.type === 'poll' ||
      o.type === 'table' ||
      o.type === 'chart'
    )
  }

  /** Spatial members of a section (ISS-020) — centers inside AABB. */
  membersOfSection(section: CanvasObject): CanvasObject[] {
    if (section.type !== 'section') return []
    const halfW = section.w / 2
    const halfH = section.h / 2
    const out: CanvasObject[] = []
    for (const o of this.currentObjects()) {
      if (o.id === section.id) continue
      if (o.type === 'section' || o.type === 'connector' || o.type === 'comment') continue
      if (Math.abs(o.x - section.x) <= halfW && Math.abs(o.y - section.y) <= halfH) out.push(o)
    }
    return out
  }

  private cornerScreen(o: CanvasObject, corner: 0 | 1 | 2 | 3): { x: number; y: number } {
    const posed = { ...o, ...this.poseOf(o) }
    return this.screenFromWorld(cornerWorld(posed, corner).x, cornerWorld(posed, corner).y)
  }

  private rotateHandleScreen(o: CanvasObject): { x: number; y: number } {
    const posed = { ...o, ...this.poseOf(o) }
    const top = portWorldPos(posed, 'n')
    const dir = { x: Math.sin(posed.rotation), y: -Math.cos(posed.rotation) }
    const dist = 28 / this.camera.scale
    return this.screenFromWorld(top.x + dir.x * dist, top.y + dir.y * dist)
  }

  private hitCorner(o: CanvasObject, sx: number, sy: number): 0 | 1 | 2 | 3 | null {
    for (const c of [0, 1, 2, 3] as const) {
      const p = this.cornerScreen(o, c)
      if (Math.hypot(p.x - sx, p.y - sy) < HANDLE_HIT) return c
    }
    return null
  }

  private hitPort(o: CanvasObject, sx: number, sy: number): PortSide | null {
    const posed = { ...o, ...this.poseOf(o) }
    for (const side of allPortSides()) {
      const p = this.screenFromWorld(portWorldPos(posed, side).x, portWorldPos(posed, side).y)
      if (Math.hypot(p.x - sx, p.y - sy) < PORT_HIT) return side
    }
    return null
  }

  /**
   * Outer band of the selection AABB (ISS-017) — just outside the square so mid-edge ports still win.
   */
  private hitRotateEdge(o: CanvasObject, sx: number, sy: number): 'n' | 'e' | 's' | 'w' | null {
    if (this.hitCorner(o, sx, sy) != null) return null
    const pad = 14
    const inner = 4
    const corners = ([0, 1, 2, 3] as const).map((c) => this.cornerScreen(o, c))
    // Expand outward along edge normals in screen space using center
    const cx = (corners[0]!.x + corners[2]!.x) / 2
    const cy = (corners[0]!.y + corners[2]!.y) / 2
    const expand = (p: { x: number; y: number }, amount: number) => {
      const dx = p.x - cx
      const dy = p.y - cy
      const len = Math.hypot(dx, dy) || 1
      return { x: p.x + (dx / len) * amount, y: p.y + (dy / len) * amount }
    }
    const outer = corners.map((p) => expand(p, pad))
    const edges: { side: 'n' | 'e' | 's' | 'w'; a: { x: number; y: number }; b: { x: number; y: number } }[] = [
      { side: 'n', a: outer[0]!, b: outer[1]! },
      { side: 'e', a: outer[1]!, b: outer[2]! },
      { side: 's', a: outer[2]!, b: outer[3]! },
      { side: 'w', a: outer[3]!, b: outer[0]! },
    ]
    let best: 'n' | 'e' | 's' | 'w' | null = null
    let bestD = pad
    for (const e of edges) {
      const d = distToSegment(sx, sy, e.a.x, e.a.y, e.b.x, e.b.y)
      const da = Math.hypot(sx - e.a.x, sy - e.a.y)
      const db = Math.hypot(sx - e.b.x, sy - e.b.y)
      if (da < HANDLE_HIT + 6 || db < HANDLE_HIT + 6) continue
      // must be outside the inner box (not on the fill)
      const inside = pointInQuad(sx, sy, corners[0]!, corners[1]!, corners[2]!, corners[3]!)
      if (inside && d > inner) continue
      if (d < bestD) {
        bestD = d
        best = e.side
      }
    }
    return best
  }

  private updateSelectCursor(sx: number, sy: number): void {
    if (!this.app) return
    if (this.tool !== 'select' || this.replayMode) {
      this.app.canvas.style.cursor = this.tool === 'hand' ? 'grab' : this.tool === 'select' ? 'default' : 'crosshair'
      return
    }
    const sel = this.selectedId ? this.liveObjects.get(this.selectedId) : null
    if (!sel || sel.type === 'connector') {
      this.app.canvas.style.cursor = 'default'
      return
    }
    if (sel.type !== 'comment' && sel.type !== 'section' && sel.type !== 'ink' && sel.type !== 'sticker') {
      const rh = this.rotateHandleScreen(sel)
      if (Math.hypot(rh.x - sx, rh.y - sy) < HANDLE_HIT) {
        this.app.canvas.style.cursor = 'grab'
        return
      }
    }
    const corner = this.hitCorner(sel, sx, sy)
    if (corner != null && sel.type !== 'comment') {
      this.app.canvas.style.cursor = corner === 0 || corner === 2 ? 'nwse-resize' : 'nesw-resize'
      return
    }
    if (sel.type === 'shape' && this.hitPort(sel, sx, sy)) {
      this.app.canvas.style.cursor = 'pointer'
      return
    }
    if (sel.type !== 'comment' && sel.type !== 'section' && sel.type !== 'ink' && sel.type !== 'sticker' && this.hitRotateEdge(sel, sx, sy)) {
      this.app.canvas.style.cursor = 'grab'
      return
    }
    this.app.canvas.style.cursor = 'default'
  }

  private connectorHosts(o: CanvasObject): { from?: CanvasObject; to?: CanvasObject } {
    const fromEp = o.data.from as ConnectorEndpoint | undefined
    const toEp = o.data.to as ConnectorEndpoint | undefined
    return {
      from: isPortEndpoint(fromEp) ? this.liveObjects.get(fromEp.objectId) : undefined,
      to: isPortEndpoint(toEp) ? this.liveObjects.get(toEp.objectId) : undefined,
    }
  }

  private hitConnectorMid(o: CanvasObject, sx: number, sy: number): boolean {
    if (o.type !== 'connector') return false
    const { from, to } = this.connectorHosts(o)
    const layout = layoutConnector(o, from, to)
    if (!layout) return false
    const p = this.screenFromWorld(layout.mid.x, layout.mid.y)
    return Math.hypot(p.x - sx, p.y - sy) < HANDLE_HIT
  }

  private objectsInMarquee(x0: number, y0: number, x1: number, y1: number): string[] {
    const minX = Math.min(x0, x1)
    const maxX = Math.max(x0, x1)
    const minY = Math.min(y0, y1)
    const maxY = Math.max(y0, y1)
    const ids: string[] = []
    for (const o of this.currentObjects()) {
      if (o.type === 'connector') continue
      if (o.x >= minX && o.x <= maxX && o.y >= minY && o.y <= maxY) ids.push(o.id)
    }
    return ids
  }

  // ---------- input ----------

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.active || this.destroyed || !this.app) return
    const { sx, sy } = this.screenPos(e)
    this.pointers.set(e.pointerId, { sx, sy })

    if (this.pointers.size === 2) {
      const [a, b] = Array.from(this.pointers.entries())
      this.drag = null
      this.pinch = {
        a: a[0],
        b: b[0],
        dist: Math.hypot(a[1].sx - b[1].sx, a[1].sy - b[1].sy),
        midSX: (a[1].sx + b[1].sx) / 2,
        midSY: (a[1].sy + b[1].sy) / 2,
      }
      return
    }

    const base: DragState = {
      mode: 'maybe-pan',
      pointerId: e.pointerId,
      startSX: sx,
      startSY: sy,
      lastSX: sx,
      lastSY: sy,
      moved: false,
      samples: [],
      shiftKey: e.shiftKey,
    }
    const w = this.worldFromScreen(sx, sy)

    if (e.button === 1 || this.tool === 'hand' || this.replayMode) {
      this.drag = { ...base, mode: 'maybe-pan' }
      return
    }

    if (this.tool === 'ink') {
      if (this.pendingInkMode === 'eraser') {
        this.cb.onEraseInk?.(w.x, w.y, Math.max(10, this.pendingInkWidth))
        this.drag = { ...base, mode: 'ink-erase' }
      } else {
        this.inkPreview.clear()
        this.inkPreview.circle(w.x, w.y, this.pendingInkWidth / 2).fill({
          color: parseInt(this.pendingInkColor.replace('#', ''), 16),
          alpha: this.pendingInkMode === 'highlighter' ? 0.35 : 1,
        })
        this.drag = { ...base, mode: 'ink-draw', inkPoints: [{ ...w }] }
      }
      return
    }

    if (this.tool === 'connect') {
      const hit = this.hitTest(w.x, w.y)
      if (hit && hit.type !== 'connector' && this.isConnectHost(hit)) {
        const side = nearestPortSide(hit, w.x, w.y)
        this.connectFrom = { id: hit.id, side }
        this.drag = { ...base, mode: 'port-drag', id: hit.id, portSide: side }
        this.rubberBand = { ...w }
        return
      }
      // Free-space connector start (ISS-040)
      this.drag = { ...base, mode: 'port-drag', freeStart: { ...w } }
      this.rubberBand = { ...w }
      return
    }

    if (this.tool === 'select') {
      const primary = this.selectedId ? this.liveObjects.get(this.selectedId) : null

      // connector mid joint
      if (primary?.type === 'connector' && this.hitConnectorMid(primary, sx, sy)) {
        this.drag = { ...base, mode: 'mid-drag', id: primary.id }
        return
      }

      if (primary && primary.type !== 'connector' && primary.type !== 'comment' && primary.type !== 'section' && primary.type !== 'ink' && primary.type !== 'sticker') {
        const rot = this.rotateHandleScreen(primary)
        if (Math.hypot(rot.x - sx, rot.y - sy) < HANDLE_HIT) {
          this.drag = { ...base, mode: 'rotate', id: primary.id }
          return
        }
        const corner = this.hitCorner(primary, sx, sy)
        if (corner != null) {
          this.drag = { ...base, mode: 'resize', id: primary.id, corner }
          return
        }
        // ports only on shapes
        if (primary.type === 'shape') {
          const port = this.hitPort(primary, sx, sy)
          if (port) {
            this.drag = { ...base, mode: 'port-drag', id: primary.id, portSide: port }
            this.rubberBand = { ...w }
            return
          }
        }
        if (this.hitRotateEdge(primary, sx, sy)) {
          this.drag = { ...base, mode: 'rotate', id: primary.id }
          if (this.app) this.app.canvas.style.cursor = 'grabbing'
          return
        }
      }

      // sections + ink + stickers: resize corners only (no rotate)
      if (
        primary?.type === 'section' ||
        primary?.type === 'ink' ||
        primary?.type === 'sticker' ||
        primary?.type === 'code' ||
        primary?.type === 'poll' ||
        primary?.type === 'table' ||
        primary?.type === 'chart'
      ) {
        const corner = this.hitCorner(primary, sx, sy)
        if (corner != null) {
          const inkResize =
            primary.type === 'ink'
              ? {
                  w: primary.w,
                  h: primary.h,
                  width: Number(primary.data.width ?? 4),
                  points: Array.isArray(primary.data.points)
                    ? (primary.data.points as { x: number; y: number }[]).map((p) => ({ ...p }))
                    : [],
                }
              : undefined
          this.drag = { ...base, mode: 'resize', id: primary.id, corner, inkResize }
          return
        }
      }

      const hit = this.hitTest(w.x, w.y)
      if (hit) {
        if (e.shiftKey) {
          if (this.isSelected(hit.id)) this.emitSelect(this.selectedIds.filter((id) => id !== hit.id))
          else this.emitSelect([...this.selectedIds.filter((id) => id !== hit.id), hit.id])
        } else if (!this.isSelected(hit.id)) {
          this.emitSelect([hit.id])
        } else {
          // keep multi, make hit primary
          this.emitSelect([...this.selectedIds.filter((id) => id !== hit.id), hit.id])
        }
        const starts = new Map<string, { x: number; y: number }>()
        for (const id of this.selectedIds) {
          const o = this.liveObjects.get(id)
          if (o && o.type !== 'connector') starts.set(id, { x: o.x, y: o.y })
        }
        // Section drag moves spatial members with it (ISS-020)
        for (const id of [...starts.keys()]) {
          const o = this.liveObjects.get(id)
          if (o?.type !== 'section') continue
          for (const m of this.membersOfSection(o)) {
            if (!starts.has(m.id)) starts.set(m.id, { x: m.x, y: m.y })
          }
        }
        // Keep anchored comments glued during group/host drag (ISS-021)
        for (const o of this.currentObjects()) {
          if (o.type !== 'comment') continue
          const aid = typeof o.data.anchorId === 'string' ? o.data.anchorId : ''
          if (aid && starts.has(aid) && !starts.has(o.id)) starts.set(o.id, { x: o.x, y: o.y })
        }
        this.drag = {
          ...base,
          mode: 'maybe-drag',
          id: hit.id,
          startX: hit.x,
          startY: hit.y,
          starts,
        }
        this.drag.samples.push({ t: performance.now(), x: hit.x, y: hit.y })
      } else {
        // empty → marquee (select tool) rather than pan
        this.drag = { ...base, mode: 'marquee' }
        this.marqueeWorld = { x0: w.x, y0: w.y, x1: w.x, y1: w.y }
        if (!e.shiftKey) this.emitSelect([])
      }
      return
    }

    this.drag = { ...base, mode: 'create' }
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.active || !this.app) return
    const { sx, sy } = this.screenPos(e)

    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { sx, sy })

    const w = this.worldFromScreen(sx, sy)
    this.cb.onCursor?.(w.x, w.y)

    // hover ports + selection chrome cursors when idle (ISS-017)
    if (!this.drag && this.tool === 'select' && this.selectedId) {
      const sel = this.liveObjects.get(this.selectedId)
      if (sel && sel.type === 'shape') {
        const side = this.hitPort(sel, sx, sy)
        this.hoverPort = side ? { id: sel.id, side } : null
      } else this.hoverPort = null
      this.updateSelectCursor(sx, sy)
    } else if (!this.drag && this.app) {
      this.hoverPort = null
      if (this.tool === 'select') this.app.canvas.style.cursor = 'default'
    }

    if (this.pinch) {
      const a = this.pointers.get(this.pinch.a)
      const b = this.pointers.get(this.pinch.b)
      if (!a || !b) return
      const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy)
      const midSX = (a.sx + b.sx) / 2
      const midSY = (a.sy + b.sy) / 2
      if (this.pinch.dist > 0) this.zoomAt(midSX, midSY, dist / this.pinch.dist)
      this.panBy(this.pinch.midSX - midSX, this.pinch.midSY - midSY)
      this.pinch = { ...this.pinch, dist, midSX, midSY }
      return
    }

    const d = this.drag
    if (!d || d.pointerId !== e.pointerId) return
    const dx = sx - d.lastSX
    const dy = sy - d.lastSY
    const totalDist = Math.hypot(sx - d.startSX, sy - d.startSY)

    if (d.mode === 'maybe-drag' && totalDist > 4) d.mode = 'drag'
    if (d.mode === 'maybe-pan' && totalDist > 4) d.mode = 'pan'

    if (d.mode === 'pan') {
      this.panBy(-dx, -dy)
      if (this.app) this.app.canvas.style.cursor = 'grabbing'
    } else if (d.mode === 'marquee') {
      this.marqueeWorld = {
        x0: this.worldFromScreen(d.startSX, d.startSY).x,
        y0: this.worldFromScreen(d.startSX, d.startSY).y,
        x1: w.x,
        y1: w.y,
      }
    } else if (d.mode === 'port-drag' && (d.freeStart || (d.id && d.portSide))) {
      d.moved = totalDist > 6
      this.rubberBand = { ...w }
      const exclude = d.id
      const snap = this.nearestConnectTarget(w.x, w.y, exclude)
      this.connectSnap = snap && this.isConnectHost(snap) ? { id: snap.id, side: nearestPortSide(snap, w.x, w.y) } : null
    } else if (d.mode === 'ink-erase') {
      this.cb.onEraseInk?.(w.x, w.y, Math.max(10, this.pendingInkWidth))
    } else if (d.mode === 'ink-draw' && d.inkPoints) {
      const last = d.inkPoints[d.inkPoints.length - 1]!
      if (Math.hypot(w.x - last.x, w.y - last.y) >= 2 / this.camera.scale) {
        d.inkPoints.push({ ...w })
        this.inkPreview.clear()
        const pts = d.inkPoints
        if (pts.length === 1) {
          this.inkPreview.circle(pts[0]!.x, pts[0]!.y, this.pendingInkWidth / 2).fill({
            color: parseInt(this.pendingInkColor.replace('#', ''), 16),
            alpha: this.pendingInkMode === 'highlighter' ? 0.35 : 1,
          })
        } else {
          this.inkPreview.moveTo(pts[0]!.x, pts[0]!.y)
          for (let i = 1; i < pts.length; i++) this.inkPreview.lineTo(pts[i]!.x, pts[i]!.y)
          this.inkPreview.stroke({
            width: this.pendingInkWidth,
            color: parseInt(this.pendingInkColor.replace('#', ''), 16),
            alpha: this.pendingInkMode === 'highlighter' ? 0.35 : 1,
            cap: 'round',
            join: 'round',
          })
        }
      }
    } else if (d.mode === 'mid-drag' && d.id) {
      const live = this.liveObjects.get(d.id)
      if (live) {
        live.data = { ...live.data, mid: { x: w.x, y: w.y } }
        this.views.get(d.id)?.update(live, true)
        this.pendingWrite = { kind: 'connectorMid', id: d.id, mid: { x: w.x, y: w.y } }
      }
    } else if (d.mode === 'drag' && d.starts) {
      const ox = (sx - d.startSX) / this.camera.scale
      const oy = (sy - d.startSY) / this.camera.scale
      d.moved = true
      const updates: { id: string; x: number; y: number }[] = []
      for (const [id, start] of d.starts) {
        const nx = start.x + ox
        const ny = start.y + oy
        const live = this.liveObjects.get(id)
        if (live) {
          live.x = nx
          live.y = ny
          this.views.get(id)?.update(live, true)
        }
        updates.push({ id, x: nx, y: ny })
        if (id === d.id) d.samples.push({ t: performance.now(), x: nx, y: ny })
      }
      if (d.samples.length > 8) d.samples.splice(0, d.samples.length - 8)
      this.pendingWrite = { kind: 'move', updates }
    } else if (d.mode === 'resize' && d.id != null && d.corner != null) {
      const o = this.liveObjects.get(d.id)
      if (o) {
        const fixed = cornerWorld(o, oppositeCorner(d.corner))
        const moving = w
        const cos = Math.cos(-o.rotation)
        const sin = Math.sin(-o.rotation)
        // vector fixed→moving in local space
        const vx = moving.x - fixed.x
        const vy = moving.y - fixed.y
        const lx = vx * cos - vy * sin
        const ly = vx * sin + vy * cos
        // corner local signs relative to center
        const signs: [number, number][] = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]
        const [sxn, syn] = signs[d.corner]
        const nw = Math.max(24, Math.abs(lx))
        const nh = Math.max(24, Math.abs(ly))
        // new center = fixed + local (sxn*nw/2, syn*nh/2) rotated
        const clx = sxn * (nw / 2)
        const cly = syn * (nh / 2)
        const rcos = Math.cos(o.rotation)
        const rsin = Math.sin(o.rotation)
        const nx = fixed.x + clx * rcos - cly * rsin
        const ny = fixed.y + clx * rsin + cly * rcos
        o.w = nw
        o.h = nh
        o.x = nx
        o.y = ny
        if (o.type === 'ink' && d.inkResize) {
          const scale = Math.min(nw / Math.max(1, d.inkResize.w), nh / Math.max(1, d.inkResize.h))
          const width = Math.max(1, d.inkResize.width * scale)
          o.data = {
            ...o.data,
            width,
            points: d.inkResize.points.map((p) => ({ x: p.x * scale, y: p.y * scale })),
          }
        }
        this.views.get(d.id)?.update(o, true)
        this.pendingWrite = { kind: 'resize', id: d.id, w: nw, h: nh, x: nx, y: ny }
      }
    } else if (d.mode === 'rotate' && d.id) {
      const o = this.liveObjects.get(d.id)
      if (o) {
        const rot = Math.atan2(w.y - o.y, w.x - o.x) + Math.PI / 2
        o.rotation = rot
        this.views.get(d.id)?.update(o, true)
        this.pendingWrite = { kind: 'rotate', id: d.id, rotation: rot }
        if (this.app) this.app.canvas.style.cursor = 'grabbing'
      }
    }

    d.lastSX = sx
    d.lastSY = sy
  }

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId)
    if (this.pinch && (this.pinch.a === e.pointerId || this.pinch.b === e.pointerId)) {
      this.pinch = null
      return
    }
    const d = this.drag
    if (!d || d.pointerId !== e.pointerId) return
    this.drag = null
    if (this.app && this.tool !== 'hand') this.app.canvas.style.cursor = this.tool === 'select' ? 'default' : 'crosshair'

    const { sx, sy } = this.screenPos(e)
    const w = this.worldFromScreen(sx, sy)

    if (d.mode === 'ink-draw') {
      this.inkPreview.clear()
      const points = d.inkPoints ?? []
      if (points.length > 0 && this.pendingInkMode !== 'eraser') {
        this.cb.onInkStroke?.(
          points,
          this.pendingInkMode as Exclude<InkMode, 'eraser'>,
          this.pendingInkWidth,
          this.pendingInkColor,
        )
      }
      return
    }
    if (d.mode === 'ink-erase') return

    if (d.mode === 'create') {
      if (Math.hypot(sx - d.startSX, sy - d.startSY) < 8 && !this.replayMode) {
        this.cb.onCreateAt?.(this.tool, w.x, w.y)
      }
      return
    }

    if (d.mode === 'marquee') {
      const m = this.marqueeWorld
      this.marqueeWorld = null
      if (!m) return
      const dist = Math.hypot(sx - d.startSX, sy - d.startSY)
      if (dist < 4) {
        if (!d.shiftKey) this.emitSelect([])
        return
      }
      const ids = this.objectsInMarquee(m.x0, m.y0, m.x1, m.y1)
      if (d.shiftKey) {
        const set = new Set(this.selectedIds)
        for (const id of ids) set.add(id)
        this.emitSelect([...set])
      } else this.emitSelect(ids)
      return
    }

    if (d.mode === 'port-drag' && (d.freeStart || (d.id && d.portSide))) {
      this.rubberBand = null
      const moved = Math.hypot(sx - d.startSX, sy - d.startSY) > 8
      if (!moved) {
        if (d.id && d.portSide) {
          this.cb.onQuickConnect?.(d.id, d.portSide, this.pendingConnectorStyle)
        }
        this.connectFrom = null
        this.connectSnap = null
        return
      }
      const snap = this.connectSnap
      this.connectSnap = null

      const startEp: ConnectorEndpoint =
        d.id && d.portSide
          ? portEndpoint(d.id, d.portSide)
          : freeEndpoint(d.freeStart!.x, d.freeStart!.y)

      const hit =
        (snap ? this.liveObjects.get(snap.id) : null) ??
        this.nearestConnectTarget(w.x, w.y, d.id)

      let endEp: ConnectorEndpoint
      if (hit && hit.id !== d.id && this.isConnectHost(hit)) {
        const toSide = snap?.id === hit.id ? snap.side : nearestPortSide(hit, w.x, w.y)
        endEp = portEndpoint(hit.id, toSide)
      } else {
        endEp = freeEndpoint(w.x, w.y)
      }

      this.cb.onConnectStroke?.(startEp, endEp, this.pendingConnectorStyle)
      this.connectFrom = null
      return
    }

    if (d.mode === 'maybe-drag' && d.id) {
      const now = performance.now()
      if (this.lastTap && this.lastTap.id === d.id && now - this.lastTap.t < 350) {
        this.lastTap = null
        this.cb.onObjectDoubleTap?.(d.id)
      } else {
        this.lastTap = { id: d.id, t: now }
        this.cb.onObjectTap?.(d.id)
      }
      return
    }

    if (d.mode === 'drag' && d.id) {
      this.flushPendingWrite(true)
      const now = performance.now()
      const recent = d.samples.filter((s) => now - s.t < 140)
      let vx = 0
      let vy = 0
      if (recent.length >= 2) {
        const first = recent[0]!
        const last = recent[recent.length - 1]!
        const dt = (last.t - first.t) / 1000
        if (dt > 0.008) {
          vx = (last.x - first.x) / dt
          vy = (last.y - first.y) / dt
        }
      }
      this.cb.onDragEnd?.(d.id, vx, vy)
      for (const id of this.selectedIds) this.ensureVisible(id)
    } else if (d.mode === 'resize' || d.mode === 'rotate' || d.mode === 'mid-drag') {
      this.flushPendingWrite(true)
      if (d.id) this.ensureVisible(d.id)
    }
  }

  private onWheel = (e: WheelEvent): void => {
    if (!this.active || !this.app) return
    e.preventDefault()
    const { sx, sy } = this.screenPos(e)
    if (e.ctrlKey || e.metaKey) {
      this.zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0024))
    } else {
      this.panBy(e.deltaX, e.deltaY)
    }
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.active) return
    const el = document.activeElement
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) return
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedIds.length && !this.replayMode) {
      this.cb.onDeleteKey?.([...this.selectedIds])
    } else if (e.key === 'Escape') {
      this.emitSelect([])
      this.connectFrom = null
      this.connectSnap = null
      this.rubberBand = null
      this.drag = null
      this.inkPreview.clear()
      this.cb.onToolShortcut?.('select')
    } else if (e.key === 'v' || e.key === 'V') {
      this.cb.onToolShortcut?.('select')
    } else if (e.key === 'h' || e.key === 'H') {
      this.cb.onToolShortcut?.('hand')
    } else if (e.shiftKey && (e.key === 's' || e.key === 'S')) {
      this.cb.onToolShortcut?.('section')
    }
  }

  // ---------- render loop ----------

  private flushPendingWrite(force = false): void {
    if (!this.pendingWrite) return
    const now = performance.now()
    if (!force && now - this.lastWriteAt < WRITE_INTERVAL_MS) return
    const w = this.pendingWrite
    this.pendingWrite = null
    this.lastWriteAt = now
    if (w.kind === 'move') this.cb.onMoveMany?.(w.updates)
    else if (w.kind === 'resize') this.cb.onResize?.(w.id, w.w, w.h, w.x, w.y)
    else if (w.kind === 'rotate') this.cb.onRotate?.(w.id, w.rotation)
    else if (w.kind === 'connectorMid') this.cb.onConnectorMid?.(w.id, w.mid)
  }

  private drawSelectionBox(g: Graphics, o: CanvasObject, rootX: number, rootY: number, rootRot: number): void {
    const cam = this.camera
    const p = this.screenFromWorld(rootX, rootY)
    const hw = (o.w / 2) * cam.scale
    const hh = (o.h / 2) * cam.scale
    const cos = Math.cos(rootRot)
    const sin = Math.sin(rootRot)
    const corners = [
      [-hw - 3, -hh - 3],
      [hw + 3, -hh - 3],
      [hw + 3, hh + 3],
      [-hw - 3, hh + 3],
    ].map(([lx, ly]) => ({ x: p.x + lx * cos - ly * sin, y: p.y + lx * sin + ly * cos }))
    g.moveTo(corners[0]!.x, corners[0]!.y)
    for (let i = 1; i < corners.length; i++) g.lineTo(corners[i]!.x, corners[i]!.y)
    g.closePath().stroke({ width: 1.5, color: this.accent })
  }

  private tick(dtMs: number): void {
    if (!this.active || !this.app) return
    this.flushPendingWrite()
    this.onTickHook?.(dtMs)

    const cam = this.camera
    const k = Math.min(1, 1 - Math.exp((-dtMs * 16) / 1000))

    if (this.app.screen.width !== this.lastScreenW || this.app.screen.height !== this.lastScreenH) {
      this.lastScreenW = this.app.screen.width
      this.lastScreenH = this.app.screen.height
      this.cameraDirty = true
    }

    this.world.scale.set(cam.scale)
    this.world.position.set(-cam.x * cam.scale, -cam.y * cam.scale)

    if (this.grid && this.cameraDirty) {
      let spacing = 32
      while (spacing * cam.scale < 22 && spacing < 4096) spacing *= 2
      while (spacing * cam.scale > 44 && spacing > 4) spacing /= 2
      const sp = spacing * cam.scale
      this.grid.width = this.app.screen.width
      this.grid.height = this.app.screen.height
      this.grid.tileScale.set(sp / 64)
      this.grid.tilePosition.set(((-cam.x * cam.scale) % sp + sp) % sp, ((-cam.y * cam.scale) % sp + sp) % sp)
      this.grid.alpha = Math.max(0, Math.min(1, (cam.scale - 0.07) / 0.13)) * 0.9
    }

    // Keep connector geometry in sync with endpoints
    for (const o of this.liveObjects.values()) {
      if (o.type !== 'connector') continue
      const { from, to } = this.connectorHosts(o)
      const layout = layoutConnector(o, from, to)
      if (!layout) continue
      const bb = {
        x: (Math.min(...layout.points.map((p) => p.x)) + Math.max(...layout.points.map((p) => p.x))) / 2,
        y: (Math.min(...layout.points.map((p) => p.y)) + Math.max(...layout.points.map((p) => p.y))) / 2,
        w: Math.max(24, Math.max(...layout.points.map((p) => p.x)) - Math.min(...layout.points.map((p) => p.x)) + 24),
        h: Math.max(24, Math.max(...layout.points.map((p) => p.y)) - Math.min(...layout.points.map((p) => p.y)) + 24),
      }
      o.x = bb.x
      o.y = bb.y
      o.w = bb.w
      o.h = bb.h
      o.data = { ...o.data, _pts: layout.points, mid: layout.mid }
      this.views.get(o.id)?.update(o, true)
    }

    const vp = this.viewportWorldRect()
    const margin = 400 / cam.scale
    const draggingId =
      this.drag?.mode === 'drag' || this.drag?.mode === 'resize' || this.drag?.mode === 'rotate' ? this.drag.id : null
    for (const v of this.views.values()) {
      const ov = !this.replayMode && this.localOverride ? this.localOverride(v.id) : null
      if (ov) {
        v.tx = ov.x
        v.ty = ov.y
        v.trot = ov.rotation
        v.snap()
        // Keep liveObjects in sync so selection chrome / consumers match Matter (ISS-029)
        const live = this.liveObjects.get(v.id)
        if (live) {
          live.x = ov.x
          live.y = ov.y
          live.rotation = ov.rotation
        }
      } else if (v.id === draggingId || (this.drag?.mode === 'drag' && this.isSelected(v.id))) {
        v.snap()
      } else {
        v.tick(k)
      }
      const o = v.obj
      if (this.isSelected(v.id) || v.id === draggingId) {
        v.root.visible = true
        continue
      }
      const rx = v.root.x
      const ry = v.root.y
      if (!Number.isFinite(rx) || !Number.isFinite(ry)) {
        v.root.visible = true
        continue
      }
      const r = Math.max(finiteSize(o.w), finiteSize(o.h)) / 2
      v.root.visible =
        rx + r > vp.x - margin && rx - r < vp.x + vp.w + margin && ry + r > vp.y - margin && ry - r < vp.y + vp.h + margin
    }

    this.peerOverlay.clear()
    this.peerOverlay.position.set(0, 0)
    this.peerOverlay.rotation = 0
    if (!this.replayMode) {
      for (const ps of this.peerSelections) {
        const v = this.views.get(ps.objectId)
        if (!v || !v.root.visible) continue
        const o = v.obj
        const p = this.screenFromWorld(v.root.x, v.root.y)
        const color = hexToNumber(ps.color)
        const hw = (o.w / 2) * cam.scale + 5
        const hh = (o.h / 2) * cam.scale + 5
        const g = this.peerOverlay
        const cos = Math.cos(v.root.rotation)
        const sin = Math.sin(v.root.rotation)
        const corners = [
          [-hw, -hh],
          [hw, -hh],
          [hw, hh],
          [-hw, hh],
        ].map(([lx, ly]) => ({ x: p.x + lx * cos - ly * sin, y: p.y + lx * sin + ly * cos }))
        g.moveTo(corners[0]!.x, corners[0]!.y)
        for (let i = 1; i < corners.length; i++) g.lineTo(corners[i]!.x, corners[i]!.y)
        g.closePath().stroke({ width: 2, color, alpha: 0.85 })
      }
    }

    // own selection + handles + ports
    this.overlay.clear()
    this.overlay.position.set(0, 0)
    this.overlay.rotation = 0
    if (!this.replayMode) {
      for (const id of this.selectedIds) {
        const v = this.views.get(id)
        if (!v) continue
        this.drawSelectionBox(this.overlay, v.obj, v.root.x, v.root.y, v.root.rotation)
      }

      const primary = this.selectedId ? this.liveObjects.get(this.selectedId) : null
      const pv = this.selectedId ? this.views.get(this.selectedId) : null
      if (primary && pv) {
        if (primary.type === 'connector') {
          const { from, to } = this.connectorHosts(primary)
          const layout = layoutConnector(primary, from, to)
          if (layout) {
            const mid = this.screenFromWorld(layout.mid.x, layout.mid.y)
            this.overlay.circle(mid.x, mid.y, 6).fill(this.accent)
            const a = this.screenFromWorld(layout.from.x, layout.from.y)
            const b = this.screenFromWorld(layout.to.x, layout.to.y)
            this.overlay.circle(a.x, a.y, 5).fill(0xffffff).stroke({ width: 1.5, color: this.accent })
            this.overlay.circle(b.x, b.y, 5).fill(0xffffff).stroke({ width: 1.5, color: this.accent })
          }
        } else if (primary.type === 'comment') {
          // pins only use the selection outline — no resize/rotate chrome
        } else {
          // 4 corners for resizable objects (including ink — ISS-030)
          for (const c of [0, 1, 2, 3] as const) {
            const p = this.cornerScreen(primary, c)
            this.overlay.rect(p.x - 5, p.y - 5, 10, 10).fill(0xffffff).stroke({ width: 1.5, color: this.accent })
          }
          if (primary.type !== 'section' && primary.type !== 'ink' && primary.type !== 'sticker') {
            const rh = this.rotateHandleScreen(primary)
            const posed = { ...primary, ...this.poseOf(primary) }
            const top = this.screenFromWorld(portWorldPos(posed, 'n').x, portWorldPos(posed, 'n').y)
            this.overlay.moveTo(top.x, top.y).lineTo(rh.x, rh.y).stroke({ width: 1.2, color: this.accent, alpha: 0.7 })
            this.overlay.circle(rh.x, rh.y, 6).fill(this.accent)
          }

          if (primary.type === 'shape') {
            for (const side of allPortSides()) {
              const wp = portWorldPos(primary, side)
              const sp = this.screenFromWorld(wp.x, wp.y)
              const hot = this.hoverPort?.id === primary.id && this.hoverPort.side === side
              if (hot) {
                this.overlay.circle(sp.x, sp.y, 12).fill(this.accent)
                const off = quickAddOffset(side, 1)
                const ax = sp.x + off.x * 5
                const ay = sp.y + off.y * 5
                this.overlay.moveTo(sp.x - off.x * 4, sp.y - off.y * 4).lineTo(ax, ay).stroke({ width: 2, color: 0xffffff })
                const go = quickAddOffset(side, QUICK_ADD_GAP)
                const gx = (primary.x + go.x - cam.x) * cam.scale
                const gy = (primary.y + go.y - cam.y) * cam.scale
                const ghw = (primary.w / 2) * cam.scale
                const ghh = (primary.h / 2) * cam.scale
                this.overlay.rect(gx - ghw, gy - ghh, ghw * 2, ghh * 2).stroke({ width: 1.5, color: 0x94a3b8, alpha: 0.7 })
                this.overlay.moveTo(sp.x, sp.y).lineTo(gx, gy).stroke({ width: 1.5, color: 0x94a3b8, alpha: 0.7 })
              } else {
                this.overlay.circle(sp.x, sp.y, 5).fill(0xbdd6fe).stroke({ width: 1, color: this.accent, alpha: 0.5 })
              }
            }
          }
        }
      }

      // marquee
      if (this.marqueeWorld) {
        const m = this.marqueeWorld
        const a = this.screenFromWorld(m.x0, m.y0)
        const b = this.screenFromWorld(m.x1, m.y1)
        const x = Math.min(a.x, b.x)
        const y = Math.min(a.y, b.y)
        this.overlay.rect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y)).fill({ color: this.accent, alpha: 0.08 }).stroke({
          width: 1,
          color: this.accent,
          alpha: 0.6,
        })
      }

      // connect-mode: show ports on eligible hosts (ISS-037)
      if (this.tool === 'connect') {
        for (const o of this.currentObjects()) {
          if (!this.isConnectHost(o)) continue
          const posed = { ...o, ...this.poseOf(o) }
          for (const side of allPortSides()) {
            const wp = portWorldPos(posed, side)
            const sp = this.screenFromWorld(wp.x, wp.y)
            const snapHot = this.connectSnap?.id === o.id && this.connectSnap.side === side
            this.overlay
              .circle(sp.x, sp.y, snapHot ? 7 : 5)
              .fill(snapHot ? this.accent : 0xbdd6fe)
              .stroke({ width: 1.2, color: this.accent, alpha: snapHot ? 1 : 0.55 })
          }
          if (this.connectSnap?.id === o.id) {
            const p = this.screenFromWorld(posed.x, posed.y)
            const hw = (o.w / 2) * cam.scale + 4
            const hh = (o.h / 2) * cam.scale + 4
            this.overlay.rect(p.x - hw, p.y - hh, hw * 2, hh * 2).stroke({ width: 2, color: this.accent, alpha: 0.85 })
          }
        }
      }

      // rubber-band connect (styled preview)
      if (this.rubberBand && this.drag?.mode === 'port-drag') {
        let a: { x: number; y: number } | null = null
        if (this.drag.id && this.drag.portSide) {
          const from = this.liveObjects.get(this.drag.id)
          if (from) a = portWorldPos(from, this.drag.portSide)
        } else if (this.drag.freeStart) {
          a = this.drag.freeStart
        }
        if (a) {
          const b = this.connectSnap
            ? portWorldPos(this.liveObjects.get(this.connectSnap.id)!, this.connectSnap.side)
            : this.rubberBand
          const pts = previewConnectorPoints(a, b, this.pendingConnectorStyle)
          if (pts.length) {
            const s0 = this.screenFromWorld(pts[0]!.x, pts[0]!.y)
            this.overlay.moveTo(s0.x, s0.y)
            for (let i = 1; i < pts.length; i++) {
              const s = this.screenFromWorld(pts[i]!.x, pts[i]!.y)
              this.overlay.lineTo(s.x, s.y)
            }
            this.overlay.stroke({ width: 2, color: this.accent, alpha: 0.7 })
          }
        }
      }
    }

    this.cursors.tick(cam, k)

    if (this.cameraDirty) {
      this.cameraDirty = false
      this.cb.onCamera?.({ ...cam })
    }
  }
}
