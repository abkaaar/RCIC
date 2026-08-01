/**
 * PhysicsWorld — local Matter.js simulation that writes owned poses into Yjs.
 *
 * Authority model: Yjs is the source of truth. This layer is best-effort and may lag.
 * The client that throws/drags an object "owns" it, simulates collisions/fields, and
 * publishes poses at ~20Hz (wall-clock). Remotes keep matching bodies static so they still collide.
 *
 * ISS-034: soft friction, speed caps, banded Pull/Push, and play bounds so objects
 * cannot accelerate off the board (minimap fly-away).
 *
 * ISS-052: fixed timestep, skip sync echo, time-based writes, throttled play bounds,
 * shared Yjs ownership claims, field-aware timeout + LRU at MAX_OWNED.
 *
 * ISS-055: never setMass on an already-static body (NaN inertia → blank Pixi sprites).
 */
import Matter from 'matter-js'
import type { CanvasObject } from '@rcic/shared'
import { RoomStore, PHYSICS_ORIGIN } from '../sync/roomDoc'

/** Fixed simulation step — independent of render FPS (ISS-052). */
const FIXED_STEP_MS = 1000 / 60
const MAX_SUBSTEPS = 5
/** Pose publish cadence in simulated ms (~20Hz at fixed 60Hz steps). */
const WRITE_INTERVAL_MS = 50
const MAX_OWNED = 50
/** Free-motion ownership timeout (field-held time does not count). */
const OWNERSHIP_TIMEOUT_MS = 12000
/** Absolute wall cap even under continuous field force. */
const OWNERSHIP_WALL_MS = 30000
const BOUNDS_RECOMPUTE_MS = 500

/** Pull/Push outer reach (world px). */
const FIELD_RADIUS = 640
/** Auto-own neighbors only inside this band. */
const FIELD_SPREAD_RADIUS = 240
/** Pull stops applying force inside this nest distance (+ half sizes). */
const PULL_SOFT_MIN_PAD = 28
/** Push falls off beyond this (also capped by FIELD_RADIUS). */
const PUSH_SOFT_MAX = 420

/** Below this speed (Matter units / tick), treat as settled. */
const MOVE_EPSILON = 0.025
/** Release after this many consecutive settled ticks. */
const SETTLE_TICKS = 3
/** Min force magnitude before field auto-owns a neighbor. */
const FIELD_OWN_FORCE = 0.00025
/** Skip Yjs writes smaller than this (world px). */
const WRITE_DELTA_PX = 0.5

/** Matter velocity units (= world px per engine step at 60Hz). */
const MAX_THROW_SPEED = 15 // ~900 px/s
const MAX_FIELD_SPEED = 10 // ~600 px/s
const MAX_COLLIDE_SPEED = 14

const FRICTION_AIR = 0.09
const FRICTION_AIR_TIMEOUT = 0.35
const RESTITUTION = 0.42
const FIELD_FORCE_SCALE = 0.0011
const FIELD_FORCE_CLAMP = 0.012
const PULL_DAMP = 0.12

/** Soft play radius from content centroid; hard clamp beyond this. */
const PLAY_SOFT_MARGIN = 4000
const PLAY_HARD_MARGIN = 8000
const PLAY_DEFAULT_RADIUS = 6000

const NON_BODY_TYPES = new Set([
  'connector',
  'comment',
  'section',
  'ink',
  'sticker',
  'code',
  'poll',
  'table',
  'chart',
])

type ReleaseReason = 'settle' | 'timeout' | 'heal' | 'evict' | 'yield'

interface BodyEntry {
  body: Matter.Body
  w: number
  h: number
  lastWrittenX: number
  lastWrittenY: number
  lastWrittenRot: number
  settleTicks: number
  /** Wall time when free (non-field) motion started for timeout. */
  freeSince: number
  fieldForced: boolean
}

function clampVec(x: number, y: number, max: number): { x: number; y: number } {
  const s = Math.hypot(x, y)
  if (s <= max || s < 1e-8) return { x, y }
  const k = max / s
  return { x: x * k, y: y * k }
}

function clampToRadius(x: number, y: number, cx: number, cy: number, r: number): { x: number; y: number } {
  const dx = x - cx
  const dy = y - cy
  const d = Math.hypot(dx, dy)
  if (d <= r || d < 1e-8) return { x, y }
  const k = r / d
  return { x: cx + dx * k, y: cy + dy * k }
}

export class PhysicsWorld {
  enabled = true

  private engine = Matter.Engine.create({ enableSleeping: true })
  private entries = new Map<string, BodyEntry>()
  private owned = new Map<string, number>() // id -> ownedSince (wall)
  private acc = 0
  /** Simulated ms since start — drives pose write cadence independent of wall clock. */
  private simTimeMs = 0
  private lastWriteSimMs = 0
  private lastBoundsAt = 0
  private destroyed = false
  private unsubClaims: (() => void) | null = null
  /** Playfield center / hard radius recomputed from content. */
  private playCx = 0
  private playCy = 0
  private playSoftR = PLAY_DEFAULT_RADIUS
  private playHardR = PLAY_HARD_MARGIN

  constructor(private store: RoomStore) {
    this.engine.gravity.x = 0
    this.engine.gravity.y = 0

    Matter.Events.on(this.engine, 'collisionStart', (ev) => {
      for (const pair of ev.pairs) {
        this.maybeSpread(pair.bodyA, pair.bodyB)
        this.maybeSpread(pair.bodyB, pair.bodyA)
      }
    })

    if (typeof this.store.subscribePhysicsClaims === 'function') {
      this.unsubClaims = this.store.subscribePhysicsClaims((ids) => this.onClaimsChanged(ids))
    }
  }

  destroy(): void {
    this.destroyed = true
    this.unsubClaims?.()
    this.unsubClaims = null
    Matter.Engine.clear(this.engine)
    this.entries.clear()
    this.owned.clear()
  }

  private maybeSpread(a: Matter.Body, b: Matter.Body): void {
    if (!this.owned.has(a.label)) return
    if (this.owned.has(b.label)) return
    const obj = this.store.get(b.label)
    if (!obj?.physics.enabled) return
    // Keep Pull/Push emitters static — owning them mid-field causes thrash (ISS-055).
    if (obj.physics.mode !== 'normal') return
    if (!this.tryClaim(b.label)) return
    this.own(b.label, false)
    this.clampBodySpeed(b, MAX_COLLIDE_SPEED)
  }

  private clampBodySpeed(body: Matter.Body, max: number): void {
    const v = clampVec(body.velocity.x, body.velocity.y, max)
    Matter.Body.setVelocity(body, v)
  }

  // ---------- play bounds ----------

  private recomputePlayBounds(objects: CanvasObject[], force = false): void {
    const now = Date.now()
    if (!force && now - this.lastBoundsAt < BOUNDS_RECOMPUTE_MS) return
    this.lastBoundsAt = now

    let n = 0
    let sx = 0
    let sy = 0
    for (const o of objects) {
      if (NON_BODY_TYPES.has(o.type)) continue
      if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) continue
      // Exclude owned / mid-flight so a throw cannot shift bounds under itself (ISS-052).
      if (this.owned.has(o.id)) continue
      if (Math.hypot(o.x, o.y) > PLAY_HARD_MARGIN * 1.5) continue
      sx += o.x
      sy += o.y
      n++
    }
    if (n === 0) {
      this.playCx = 0
      this.playCy = 0
      this.playSoftR = PLAY_DEFAULT_RADIUS
      this.playHardR = PLAY_HARD_MARGIN
      return
    }
    this.playCx = sx / n
    this.playCy = sy / n
    let maxD = 0
    for (const o of objects) {
      if (NON_BODY_TYPES.has(o.type)) continue
      if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) continue
      if (this.owned.has(o.id)) continue
      const d = Math.hypot(o.x - this.playCx, o.y - this.playCy)
      if (d < PLAY_HARD_MARGIN * 1.5) maxD = Math.max(maxD, d)
    }
    this.playSoftR = Math.max(PLAY_DEFAULT_RADIUS, maxD + PLAY_SOFT_MARGIN * 0.35)
    this.playHardR = Math.max(this.playSoftR + 1200, PLAY_HARD_MARGIN * 0.75)
  }

  private healPose(x: number, y: number): { x: number; y: number; healed: boolean } {
    const clamped = clampToRadius(x, y, this.playCx, this.playCy, this.playHardR)
    const healed = Math.hypot(clamped.x - x, clamped.y - y) > 1
    return { ...clamped, healed }
  }

  // ---------- sync ----------

  private isPhysicsBody(o: CanvasObject): boolean {
    return !NON_BODY_TYPES.has(o.type) && !!o.physics?.enabled
  }

  private upsertBody(o: CanvasObject, heals: { id: string; patch: Partial<CanvasObject> }[]): void {
    const healed = this.healPose(o.x, o.y)
    const px = healed.x
    const py = healed.y
    if (healed.healed && !this.owned.has(o.id)) {
      heals.push({ id: o.id, patch: { x: px, y: py } })
    }

    let e = this.entries.get(o.id)
    if (e && (Math.abs(e.w - o.w) > 1 || Math.abs(e.h - o.h) > 1)) {
      Matter.World.remove(this.engine.world, e.body)
      this.entries.delete(o.id)
      this.owned.delete(o.id)
      e = undefined
    }
    if (!e) {
      // Create dynamic, setMass, then freeze. setMass on an already-static body
      // yields inertia=NaN; first own() then NaNs angle and Pixi draws nothing (ISS-055).
      const body = Matter.Bodies.rectangle(px, py, o.w, o.h, {
        label: o.id,
        frictionAir: FRICTION_AIR,
        restitution: RESTITUTION,
        angle: Number.isFinite(o.rotation) ? o.rotation : 0,
      })
      Matter.Body.setMass(body, o.physics.mass || 1)
      Matter.Body.setStatic(body, true)
      Matter.World.add(this.engine.world, body)
      this.entries.set(o.id, {
        body,
        w: o.w,
        h: o.h,
        lastWrittenX: px,
        lastWrittenY: py,
        lastWrittenRot: Number.isFinite(o.rotation) ? o.rotation : 0,
        settleTicks: 0,
        freeSince: Date.now(),
        fieldForced: false,
      })
    } else if (!this.owned.has(o.id)) {
      Matter.Body.setPosition(e.body, { x: px, y: py })
      Matter.Body.setAngle(e.body, Number.isFinite(o.rotation) ? o.rotation : 0)
      e.body.frictionAir = FRICTION_AIR
      e.body.restitution = RESTITUTION
    }
  }

  /**
   * Create/update/remove bodies to mirror the document.
   * Pass changedIds for an incremental path (ISS-052); omit for a full reconcile.
   */
  syncObjects(objects: CanvasObject[], changedIds?: Set<string>): void {
    const forceBounds = !changedIds
    this.recomputePlayBounds(objects, forceBounds)
    const heals: { id: string; patch: Partial<CanvasObject> }[] = []

    if (!changedIds) {
      const seen = new Set<string>()
      for (const o of objects) {
        if (!this.isPhysicsBody(o)) continue
        seen.add(o.id)
        this.upsertBody(o, heals)
      }
      for (const [id, e] of this.entries) {
        if (!seen.has(id)) {
          Matter.World.remove(this.engine.world, e.body)
          this.entries.delete(id)
          this.owned.delete(id)
        }
      }
    } else {
      const byId = new Map(objects.map((o) => [o.id, o]))
      for (const id of changedIds) {
        if (id === '__votes__' || id === '__meta__') continue
        const o = byId.get(id)
        if (!o || !this.isPhysicsBody(o)) {
          const e = this.entries.get(id)
          if (e) {
            Matter.World.remove(this.engine.world, e.body)
            this.entries.delete(id)
            this.owned.delete(id)
          }
          continue
        }
        this.upsertBody(o, heals)
      }
    }

    if (heals.length) this.store.updateMany(heals, PHYSICS_ORIGIN)
  }

  // ---------- ownership ----------

  /**
   * Remote pose write wins: drop local ownership so we do not fight another client's
   * pose stream (ISS-029 / ISS-052).
   */
  onRemoteChange(ids: Set<string>): void {
    for (const id of ids) {
      if (!this.owned.has(id)) continue
      this.yieldOwnership(id)
    }
  }

  /** React to Yjs physicsOwners claims from peers. */
  onClaimsChanged(ids: Set<string>): void {
    for (const id of ids) {
      const claim = this.store.getPhysicsClaim?.(id) ?? null
      if (!claim) continue
      if (claim.client === this.store.userId) continue
      if (Date.now() - claim.t > OWNERSHIP_TIMEOUT_MS) continue
      if (!this.owned.has(id)) continue
      this.yieldOwnership(id)
    }
  }

  private yieldOwnership(id: string): void {
    this.owned.delete(id)
    const e = this.entries.get(id)
    const o = this.store.get(id)
    if (e && o) {
      Matter.Body.setStatic(e.body, true)
      Matter.Body.setVelocity(e.body, { x: 0, y: 0 })
      Matter.Body.setAngularVelocity(e.body, 0)
      e.body.frictionAir = FRICTION_AIR
      const h = this.healPose(o.x, o.y)
      Matter.Body.setPosition(e.body, { x: h.x, y: h.y })
      Matter.Body.setAngle(e.body, o.rotation)
    }
  }

  /**
   * Claim via Yjs before auto-own. Direct user throw/own publishes claim too.
   * Returns false if another client holds a fresh claim.
   */
  private tryClaim(id: string): boolean {
    const getClaim = this.store.getPhysicsClaim?.bind(this.store)
    const setClaim = this.store.setPhysicsClaim?.bind(this.store)
    if (!getClaim || !setClaim) {
      this.ensureOwnedCapacity()
      return true
    }
    const cur = getClaim(id)
    const now = Date.now()
    if (cur && cur.client !== this.store.userId && now - cur.t < OWNERSHIP_TIMEOUT_MS) {
      return false
    }
    this.ensureOwnedCapacity()
    setClaim(id, this.store.userId)
    return true
  }

  /** Evict least-recently-owned body when at cap (ISS-052). */
  private ensureOwnedCapacity(): void {
    if (this.owned.size < MAX_OWNED) return
    let oldestId: string | null = null
    let oldestT = Infinity
    for (const [id, since] of this.owned) {
      if (since < oldestT) {
        oldestT = since
        oldestId = id
      }
    }
    if (oldestId) this.release(oldestId, true, 'evict')
  }

  own(id: string, publishClaim = true): void {
    const e = this.entries.get(id)
    if (!e) return
    if (publishClaim) {
      if (!this.tryClaim(id)) return
    } else {
      this.ensureOwnedCapacity()
    }
    const now = Date.now()
    if (!this.owned.has(id)) this.owned.set(id, now)
    e.settleTicks = 0
    e.freeSince = now
    e.fieldForced = false
    e.body.frictionAir = FRICTION_AIR
    Matter.Body.setStatic(e.body, false)
    // Heal bodies created before ISS-055 (setMass while static → inertia NaN).
    if (!Number.isFinite(e.body.inertia) || e.body.inertia <= 0) {
      const mass = this.store.get(id)?.physics.mass || 1
      Matter.Body.setMass(e.body, mass)
    }
    if (!Number.isFinite(e.body.angle)) Matter.Body.setAngle(e.body, 0)
    if (!Number.isFinite(e.body.angularVelocity)) Matter.Body.setAngularVelocity(e.body, 0)
    Matter.Sleeping.set(e.body, false)
  }

  isOwned(id: string): boolean {
    return this.owned.has(id)
  }

  /** Called after a body is released from ownership (pose written when writeFinal). */
  onRelease: ((id: string) => void) | null = null

  private release(id: string, writeFinal: boolean, reason: ReleaseReason = 'settle'): void {
    const e = this.entries.get(id)
    this.owned.delete(id)
    this.store.clearPhysicsClaim?.(id)
    if (!e) return
    if (writeFinal) {
      const h = this.healPose(e.body.position.x, e.body.position.y)
      if (h.healed) Matter.Body.setPosition(e.body, { x: h.x, y: h.y })
      if (!Number.isFinite(e.body.angle)) Matter.Body.setAngle(e.body, 0)
      const x = e.body.position.x
      const y = e.body.position.y
      const rotation = Number.isFinite(e.body.angle) ? e.body.angle : 0
      this.store.updateMany([{ id, patch: { x, y, rotation } }], PHYSICS_ORIGIN)
      e.lastWrittenX = x
      e.lastWrittenY = y
      e.lastWrittenRot = rotation
    }
    // Timeout: damp instead of hard freeze so field-held motion settles (ISS-052).
    if (reason === 'timeout') {
      const v = e.body.velocity
      Matter.Body.setVelocity(e.body, { x: v.x * 0.15, y: v.y * 0.15 })
      Matter.Body.setAngularVelocity(e.body, e.body.angularVelocity * 0.15)
      e.body.frictionAir = FRICTION_AIR_TIMEOUT
    } else {
      Matter.Body.setVelocity(e.body, { x: 0, y: 0 })
      Matter.Body.setAngularVelocity(e.body, 0)
      e.body.frictionAir = FRICTION_AIR
    }
    Matter.Body.setStatic(e.body, true)
    this.onRelease?.(id)
  }

  // ---------- drag / throw ----------

  /** while user drags: keep body pinned to the pointer (not owned) */
  dragTo(id: string, x: number, y: number): void {
    const e = this.entries.get(id)
    if (!e) return
    if (this.owned.has(id)) {
      this.owned.delete(id)
      this.store.clearPhysicsClaim?.(id)
    }
    // Optimistic claim so peers' auto-spread does not grab mid-drag.
    this.store.setPhysicsClaim?.(id, this.store.userId)
    Matter.Body.setStatic(e.body, true)
    const h = this.healPose(x, y)
    Matter.Body.setPosition(e.body, { x: h.x, y: h.y })
  }

  /** vx/vy in world px per second */
  throwObject(id: string, vx: number, vy: number): void {
    if (!this.enabled) return
    const e = this.entries.get(id)
    if (!e) return
    this.own(id, true)
    if (!this.owned.has(id)) return
    const gain = 0.85 / 60
    const v = clampVec(vx * gain, vy * gain, MAX_THROW_SPEED)
    Matter.Body.setVelocity(e.body, v)
    Matter.Body.setAngularVelocity(e.body, 0)
  }

  /**
   * Plain drop: pin the body to the store pose and release ownership immediately.
   */
  settle(id: string): void {
    const e = this.entries.get(id)
    if (!e) return
    const o = this.store.get(id)
    if (o) {
      const h = this.healPose(o.x, o.y)
      Matter.Body.setPosition(e.body, { x: h.x, y: h.y })
      Matter.Body.setAngle(e.body, o.rotation)
    }
    Matter.Body.setVelocity(e.body, { x: 0, y: 0 })
    Matter.Body.setAngularVelocity(e.body, 0)
    this.owned.delete(id)
    this.store.clearPhysicsClaim?.(id)
    e.body.frictionAir = FRICTION_AIR
    Matter.Body.setStatic(e.body, true)
  }

  /**
   * Pose for Pixi override — always while owned and dynamic (ISS-029).
   * Guards non-finite rotation so NaN inertia cannot blank the sprite (ISS-055).
   */
  getOwnedPosition(id: string): { x: number; y: number; rotation: number } | null {
    if (!this.owned.has(id)) return null
    const e = this.entries.get(id)
    if (!e || e.body.isStatic) return null
    const x = e.body.position.x
    const y = e.body.position.y
    const rotation = Number.isFinite(e.body.angle) ? e.body.angle : 0
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x, y, rotation }
  }

  // ---------- tick ----------

  tick(dtMs: number): void {
    if (this.destroyed || !this.enabled || this.entries.size === 0) return

    // Fixed timestep accumulator — same throw feels the same at 30/60/120fps (ISS-052).
    this.acc += Math.min(dtMs, 100)
    let steps = 0
    while (this.acc >= FIXED_STEP_MS && steps < MAX_SUBSTEPS) {
      for (const e of this.entries.values()) e.fieldForced = false
      this.applyFields()
      Matter.Engine.update(this.engine, FIXED_STEP_MS)
      this.acc -= FIXED_STEP_MS
      steps++
    }
    // Drop leftover if we hit the cap so hitch recovery does not spiral.
    if (steps >= MAX_SUBSTEPS) this.acc = Math.min(this.acc, FIXED_STEP_MS)

    this.simTimeMs += steps * FIXED_STEP_MS
    this.applyPlayBounds()

    const now = Date.now()
    for (const [id, since] of this.owned) {
      const e = this.entries.get(id)
      if (!e) {
        this.owned.delete(id)
        continue
      }
      this.clampBodySpeed(e.body, Math.max(MAX_THROW_SPEED, MAX_FIELD_SPEED))
      const speed = Math.hypot(e.body.velocity.x, e.body.velocity.y)
      const spin = Math.abs(e.body.angularVelocity)
      const settled = e.body.isSleeping || (speed < MOVE_EPSILON && spin < MOVE_EPSILON)
      if (settled) {
        e.settleTicks++
        if (e.settleTicks >= SETTLE_TICKS) this.release(id, true, 'settle')
        continue
      }
      e.settleTicks = 0
      // Field-held motion does not advance free-timeout; wall clock still caps (ISS-052).
      if (e.fieldForced) {
        e.freeSince = now
      }
      const freeAge = now - e.freeSince
      const wallAge = now - since
      if (freeAge > OWNERSHIP_TIMEOUT_MS || wallAge > OWNERSHIP_WALL_MS) {
        this.release(id, true, 'timeout')
      }
    }

    // ~20Hz pose writes from sim time (not frame count) so 30fps and 120fps stay aligned.
    if (this.simTimeMs - this.lastWriteSimMs >= WRITE_INTERVAL_MS && this.owned.size > 0) {
      this.lastWriteSimMs = this.simTimeMs
      const items: { id: string; patch: Partial<CanvasObject> }[] = []
      for (const id of this.owned.keys()) {
        const e = this.entries.get(id)
        if (!e || e.body.isStatic) continue
        const h = this.healPose(e.body.position.x, e.body.position.y)
        if (h.healed) Matter.Body.setPosition(e.body, { x: h.x, y: h.y })
        const x = Math.round(e.body.position.x * 100) / 100
        const y = Math.round(e.body.position.y * 100) / 100
        const rawRot = Number.isFinite(e.body.angle) ? e.body.angle : 0
        const rotation = Math.round(rawRot * 1000) / 1000
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue
        if (
          Math.abs(x - e.lastWrittenX) < WRITE_DELTA_PX &&
          Math.abs(y - e.lastWrittenY) < WRITE_DELTA_PX &&
          Math.abs(rotation - e.lastWrittenRot) < 0.01
        ) {
          continue
        }
        e.lastWrittenX = x
        e.lastWrittenY = y
        e.lastWrittenRot = rotation
        items.push({ id, patch: { x, y, rotation } })
      }
      this.store.updateMany(items, PHYSICS_ORIGIN)
    }
  }

  /** Soft restoring force outside soft radius; hard clamp beyond hard radius. */
  private applyPlayBounds(): void {
    for (const [id, e] of this.entries) {
      if (!this.owned.has(id) || e.body.isStatic) continue
      const { x, y } = e.body.position
      const dx = x - this.playCx
      const dy = y - this.playCy
      const dist = Math.hypot(dx, dy)
      if (dist <= this.playSoftR) continue

      if (dist > this.playHardR) {
        const clamped = clampToRadius(x, y, this.playCx, this.playCy, this.playHardR)
        Matter.Body.setPosition(e.body, clamped)
        Matter.Body.setVelocity(e.body, { x: 0, y: 0 })
        Matter.Body.setAngularVelocity(e.body, 0)
        this.release(id, true, 'heal')
        continue
      }

      // Soft wall: pull back + damp outward velocity
      const over = (dist - this.playSoftR) / Math.max(1, this.playHardR - this.playSoftR)
      const nx = dx / dist
      const ny = dy / dist
      const pull = 0.04 * over * over
      Matter.Body.applyForce(e.body, e.body.position, { x: -nx * pull, y: -ny * pull })
      const outward = e.body.velocity.x * nx + e.body.velocity.y * ny
      if (outward > 0) {
        Matter.Body.setVelocity(e.body, {
          x: e.body.velocity.x - nx * outward * 0.65,
          y: e.body.velocity.y - ny * outward * 0.65,
        })
      }
      this.clampBodySpeed(e.body, MAX_FIELD_SPEED)
    }
  }

  // ---------- fields ----------

  private applyFields(): void {
    const sources: { body: Matter.Body; sign: number; w: number; h: number }[] = []
    for (const [id, e] of this.entries) {
      const o = this.store.get(id)
      if (!o?.physics.enabled || o.physics.mode === 'normal') continue
      sources.push({
        body: e.body,
        sign: o.physics.mode === 'attract' ? 1 : -1,
        w: e.w,
        h: e.h,
      })
    }
    if (sources.length === 0) return

    for (const src of sources) {
      for (const [id, e] of this.entries) {
        if (e.body === src.body) continue
        const dx = src.body.position.x - e.body.position.x
        const dy = src.body.position.y - e.body.position.y
        const dist = Math.hypot(dx, dy)
        if (dist < 1) continue

        const nest =
          (Math.max(src.w, src.h) + Math.max(e.w, e.h)) / 4 + PULL_SOFT_MIN_PAD

        if (src.sign > 0) {
          // Pull: only beyond nest distance; inside nest, damp if already owned — do not re-own (ISS-039).
          if (dist > FIELD_RADIUS) continue
          if (dist <= nest) {
            if (!this.owned.has(id) || e.body.isStatic) continue
            Matter.Body.setVelocity(e.body, {
              x: e.body.velocity.x * (1 - PULL_DAMP),
              y: e.body.velocity.y * (1 - PULL_DAMP),
            })
            e.fieldForced = true
            continue
          }
        } else {
          // Push: only inside soft max / field radius
          if (dist > Math.min(FIELD_RADIUS, PUSH_SOFT_MAX)) continue
        }

        const falloff = Math.max(dist / 220, 1)
        let f = (FIELD_FORCE_SCALE * src.body.mass * e.body.mass * src.sign) / (falloff * falloff)
        // Push stronger when very close, weaker at edge of band
        if (src.sign < 0) {
          const edge = Math.min(FIELD_RADIUS, PUSH_SOFT_MAX)
          const t = 1 - dist / edge
          f *= 0.55 + 0.9 * t * t
        }
        f = Math.max(-FIELD_FORCE_CLAMP, Math.min(FIELD_FORCE_CLAMP, f))
        if (Math.abs(f) < FIELD_OWN_FORCE) continue

        const isOwned = this.owned.has(id)
        if (!isOwned) {
          if (dist < FIELD_SPREAD_RADIUS) {
            if (!this.tryClaim(id)) continue
            this.own(id, false)
          } else continue
        }
        if (e.body.isStatic) continue

        Matter.Body.applyForce(e.body, e.body.position, { x: (dx / dist) * f, y: (dy / dist) * f })
        Matter.Sleeping.set(e.body, false)
        this.clampBodySpeed(e.body, MAX_FIELD_SPEED)
        e.fieldForced = true
      }
    }
  }
}
