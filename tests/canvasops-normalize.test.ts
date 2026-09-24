import { describe, expect, it } from 'vitest'
import { isNearDuplicate, normalizeText, classifyTheme } from '../canvasops/src/normalize.ts'

describe('canvasops normalize', () => {
  it('normalizes punctuation and case', () => {
    expect(normalizeText('Dark Mode!')).toBe('dark mode')
  })

  it('detects near-duplicates via prefix and jaccard', () => {
    expect(isNearDuplicate('dark mode', 'Dark Mode please')).toBe(true)
    expect(isNearDuplicate('SSO login', 'SSO Login!')).toBe(true)
    expect(isNearDuplicate('Add comments', 'Add comments...')).toBe(true)
    expect(isNearDuplicate('Add dark mode', 'Queue snapshot writes')).toBe(false)
  })

  it('classifies themes', () => {
    expect(classifyTheme('Add dark mode')).toBe('UI')
    expect(classifyTheme('Risk: no auth on boards')).toBe('Risk')
    expect(classifyTheme('Cache API responses')).toBe('Performance')
  })
})
