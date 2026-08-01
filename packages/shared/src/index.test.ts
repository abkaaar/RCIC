/**
 * Shared object factory unit tests.
 */
import { describe, expect, it } from 'vitest'
import { defaultObject, massFor } from './index'

describe('defaultObject', () => {
  it('creates a section with physics off and a title', () => {
    const o = defaultObject('s1', 'section', 10, 20, 3)
    expect(o.type).toBe('section')
    expect(o.w).toBe(480)
    expect(o.h).toBe(320)
    expect(o.physics.enabled).toBe(false)
    expect(o.data.title).toBe('Section 1')
  })

  it('creates a comment pin with thread fields', () => {
    const o = defaultObject('c1', 'comment', 0, 0, 1)
    expect(o.type).toBe('comment')
    expect(o.physics.enabled).toBe(false)
    expect(o.data).toMatchObject({ text: '', author: '', resolved: false })
  })

  it('creates an ink stroke with physics disabled', () => {
    const o = defaultObject('i1', 'ink', 4, 8, 2)
    expect(o.type).toBe('ink')
    expect(o.physics.enabled).toBe(false)
    expect(o.data).toMatchObject({ mode: 'pen', width: 4, points: [] })
  })

  it('creates a sticker with emoji and physics off', () => {
    const o = defaultObject('e1', 'sticker', 0, 0, 1)
    expect(o.type).toBe('sticker')
    expect(o.physics.enabled).toBe(false)
    expect(o.w).toBe(96)
    expect(o.data.emoji).toBe('⭐')
  })

  it('massFor clamps to a sensible range', () => {
    expect(massFor(10, 10)).toBeGreaterThanOrEqual(0.5)
    expect(massFor(10_000, 10_000)).toBeLessThanOrEqual(8)
  })
})
