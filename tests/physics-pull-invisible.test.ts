/**
 * Reproduction harness for "object invisible on canvas but visible on minimap during Pull/Push".
 *
 * Minimap reads store x/y. Canvas renders getOwnedPosition() (override) when owned, else store.
 * ISS-052: FakeStore mirrors Room's skip of syncObjects on own physics echoes.
 * ISS-055: NaN inertia from setMass-on-static blanks Pixi via NaN rotation.
 */
import { describe, it, expect, vi } from 'vitest'

// Avoid pulling yjs/y-websocket by mocking the roomDoc module PhysicsWorld imports.
vi.mock('../apps/web/src/sync/roomDoc', () => ({
  PHYSICS_ORIGIN: 'rcic-physics',
  RoomStore: class {},
}))

import { PhysicsWorld } from '../apps/web/src/canvas/PhysicsWorld'
import { defaultObject, massFor, type CanvasObject } from '../packages/shared/src/index'

const COORD_CAP = 50_000
const clampCoord = (n: number) => Math.max(-COORD_CAP, Math.min(COORD_CAP, n))

class FakeStore {
  map = new Map<string, CanvasObject>()
  claims = new Map<string, { client: string; t: number }>()
  userId = 'test-client'
  physics!: PhysicsWorld
  writes = 0
  set(o: CanvasObject) {
    this.map.set(o.id, structuredClone(o))
  }
  get(id: string): CanvasObject | null {
    const o = this.map.get(id)
    return o ? structuredClone(o) : null
  }
  getAll(): CanvasObject[] {
    return [...this.map.values()].map((o) => structuredClone(o))
  }
  getPhysicsClaim(objectId: string) {
    return this.claims.get(objectId) ?? null
  }
  setPhysicsClaim(objectId: string, client: string = this.userId) {
    this.claims.set(objectId, { client, t: Date.now() })
  }
  clearPhysicsClaim(objectId: string) {
    const cur = this.claims.get(objectId)
    if (cur?.client === this.userId) this.claims.delete(objectId)
  }
  subscribePhysicsClaims(_cb: (ids: Set<string>) => void) {
    return () => {}
  }
  updateMany(items: { id: string; patch: Partial<CanvasObject> }[], _origin?: string) {
    if (!items.length) return
    this.writes++
    for (const { id, patch } of items) {
      const o = this.map.get(id)
      if (!o) continue
      const p: any = { ...patch }
      if ('x' in p) p.x = clampCoord(p.x)
      if ('y' in p) p.y = clampCoord(p.y)
      Object.assign(o, p)
    }
    // ISS-052: do not re-enter syncObjects for owned physics echoes (Matter already matches).
    const onlyOwned = items.every(({ id }) => this.physics.isOwned(id))
    if (!onlyOwned) this.physics.syncObjects(this.getAll())
  }
}

function makeShape(id: string, x: number, y: number, mode: 'normal' | 'attract' | 'repel' = 'normal'): CanvasObject {
  const o = defaultObject(id, 'shape', x, y, 1)
  o.w = 160
  o.h = 120
  o.physics = { enabled: true, mode, mass: massFor(o.w, o.h) }
  return o
}

/** What the canvas would render: override pose if owned+dynamic, else store pose. */
function renderPose(store: FakeStore, phys: PhysicsWorld, id: string) {
  const ov = phys.getOwnedPosition(id)
  if (ov) return { x: ov.x, y: ov.y, rotation: ov.rotation, owned: true }
  const o = store.get(id)!
  return { x: o.x, y: o.y, rotation: o.rotation, owned: false }
}

describe('Pull/Push canvas-vs-minimap divergence', () => {
  it('tracks store (minimap) vs render (canvas) pose for a neighbor under Pull', () => {
    const store = new FakeStore()
    const phys = new PhysicsWorld(store as any)
    store.physics = phys

    // Attract source at origin; neighbor 200px to the right (inside spread radius 240).
    store.set(makeShape('src', 0, 0, 'attract'))
    store.set(makeShape('n1', 200, 0, 'normal'))
    phys.syncObjects(store.getAll())

    let maxDivergence = 0
    let culledWhileStoreOnscreen = 0
    let nanRotFrames = 0
    // Emulate a fixed camera/viewport: 1200x800 world px centered on origin (source on screen).
    const vp = { x: -600, y: -400, w: 1200, h: 800 }
    const margin = 400
    const inView = (x: number, y: number) => {
      const r = 80
      return x + r > vp.x - margin && x - r < vp.x + vp.w + margin && y + r > vp.y - margin && y - r < vp.y + vp.h + margin
    }

    for (let i = 0; i < 600; i++) {
      phys.tick(16)
      const storeObj = store.get('n1')!
      const render = renderPose(store, phys, 'n1')
      if (!Number.isFinite(render.rotation) || !Number.isFinite(storeObj.rotation)) nanRotFrames++
      const d = Math.hypot(storeObj.x - render.x, storeObj.y - render.y)
      maxDivergence = Math.max(maxDivergence, d)
      const storeOn = inView(storeObj.x, storeObj.y)
      const renderOn = inView(render.x, render.y)
      if (storeOn && !renderOn) culledWhileStoreOnscreen++
    }

    const finalStore = store.get('n1')!
    const finalRender = renderPose(store, phys, 'n1')
    // eslint-disable-next-line no-console
    console.log(
      'PULL n1 final store',
      finalStore.x.toFixed(1),
      finalStore.y.toFixed(1),
      'render',
      finalRender.x.toFixed(1),
      finalRender.y.toFixed(1),
      'owned',
      finalRender.owned,
      'maxDiv',
      maxDivergence.toFixed(2),
      'culledFrames',
      culledWhileStoreOnscreen,
      'writes',
      store.writes,
    )

    expect(Number.isFinite(finalRender.x)).toBe(true)
    expect(Number.isFinite(finalRender.y)).toBe(true)
    expect(Number.isFinite(finalRender.rotation)).toBe(true)
    expect(nanRotFrames).toBe(0)
    // Canvas uses the Matter override while owned; store may lag ~20Hz writes.
    // Invisibility was NaN rotation / false cull — not store lag (ISS-055).
    expect(culledWhileStoreOnscreen).toBe(0)
    expect(maxDivergence).toBeLessThan(250)
  })

  it('push: neighbor very close to a repel source', () => {
    const store = new FakeStore()
    const phys = new PhysicsWorld(store as any)
    store.physics = phys
    store.set(makeShape('src', 0, 0, 'repel'))
    store.set(makeShape('n1', 60, 0, 'normal')) // overlapping/close
    phys.syncObjects(store.getAll())

    let culledWhileStoreOnscreen = 0
    let nanRotFrames = 0
    const vp = { x: -600, y: -400, w: 1200, h: 800 }
    const margin = 400
    const inView = (x: number, y: number) => {
      const r = 80
      return x + r > vp.x - margin && x - r < vp.x + vp.w + margin && y + r > vp.y - margin && y - r < vp.y + vp.h + margin
    }
    for (let i = 0; i < 600; i++) {
      phys.tick(16)
      const s = store.get('n1')!
      const r = renderPose(store, phys, 'n1')
      if (!Number.isFinite(r.rotation) || !Number.isFinite(s.rotation)) nanRotFrames++
      if (inView(s.x, s.y) && !inView(r.x, r.y)) culledWhileStoreOnscreen++
    }
    const s = store.get('n1')!
    const r = renderPose(store, phys, 'n1')
    // eslint-disable-next-line no-console
    console.log(
      'PUSH n1 final store',
      s.x.toFixed(1),
      s.y.toFixed(1),
      'render',
      r.x.toFixed(1),
      r.y.toFixed(1),
      'owned',
      r.owned,
      'writes',
      store.writes,
    )
    expect(Number.isFinite(r.x)).toBe(true)
    expect(Number.isFinite(r.y)).toBe(true)
    expect(Number.isFinite(r.rotation)).toBe(true)
    expect(nanRotFrames).toBe(0)
    expect(culledWhileStoreOnscreen).toBe(0)
  })

  it('owning a close neighbor under Pull keeps finite rotation (ISS-055)', () => {
    const store = new FakeStore()
    const phys = new PhysicsWorld(store as any)
    store.physics = phys
    store.set(makeShape('src', 0, 0, 'attract'))
    store.set(makeShape('n1', 80, 0, 'normal'))
    phys.syncObjects(store.getAll())

    // First few ticks are when auto-own + first engine step used to NaN angle.
    for (let i = 0; i < 30; i++) {
      phys.tick(16)
      const r = renderPose(store, phys, 'n1')
      expect(Number.isFinite(r.x)).toBe(true)
      expect(Number.isFinite(r.y)).toBe(true)
      expect(Number.isFinite(r.rotation)).toBe(true)
      const s = store.get('n1')!
      expect(Number.isFinite(s.rotation)).toBe(true)
    }
  })
})
