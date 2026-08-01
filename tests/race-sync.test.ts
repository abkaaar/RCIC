/**
 * Offline CRDT race: two docs diverge then merge to the same state.
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

describe('race-sync (offline CRDT)', () => {
  it('converges when two clients write different keys concurrently', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()

    // share initial empty state
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))

    a.getMap('objects').set('obj-a', { text: 'from-a', z: 1 })
    b.getMap('objects').set('obj-b', { text: 'from-b', z: 2 })

    const ua = Y.encodeStateAsUpdate(a)
    const ub = Y.encodeStateAsUpdate(b)
    Y.applyUpdate(a, ub)
    Y.applyUpdate(b, ua)

    expect(a.getMap('objects').toJSON()).toEqual(b.getMap('objects').toJSON())
    expect(a.getMap('objects').get('obj-a')).toMatchObject({ text: 'from-a' })
    expect(a.getMap('objects').get('obj-b')).toMatchObject({ text: 'from-b' })
  })

  it('last-writer-wins on the same key after merge', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))

    a.getMap('objects').set('same', { v: 1 })
    // b writes after seeing nothing; both set same key
    b.getMap('objects').set('same', { v: 2 })

    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))

    expect(a.getMap('objects').toJSON()).toEqual(b.getMap('objects').toJSON())
    // Yjs LWW / CRDT resolves to one deterministic value
    expect(a.getMap('objects').has('same')).toBe(true)
  })
})
