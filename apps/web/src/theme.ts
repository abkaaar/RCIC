/**
 * theme — personal accent color (localStorage). Not synced to collaborators.
 * Default matches RC-board brand teal (enterprise, non-purple).
 */
export const ACCENT_COLORS = [
  '#0f766e', // teal (RC-board default)
  '#0369a1', // deep blue
  '#1e3a5f', // slate navy
  '#e11d48', // rose
  '#f59e0b', // amber
  '#16a34a', // green
  '#0ea5e9', // sky
  '#7c5cff', // violet (optional personal accent)
] as const

export type AccentColor = (typeof ACCENT_COLORS)[number]

const STORAGE_KEY = 'rcic-accent'
export const DEFAULT_ACCENT: AccentColor = '#0f766e'

const listeners = new Set<(color: string) => void>()

export function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

export function loadAccent(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && ACCENT_COLORS.includes(v as AccentColor)) return v
  } catch {
    /* ignore */
  }
  return DEFAULT_ACCENT
}

export function getAccent(): string {
  return document.documentElement.style.getPropertyValue('--accent').trim() || loadAccent()
}

export function setAccent(color: string): void {
  const next = ACCENT_COLORS.includes(color as AccentColor) ? color : DEFAULT_ACCENT
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* ignore */
  }
  document.documentElement.style.setProperty('--accent', next)
  listeners.forEach((cb) => cb(next))
}

export function applyStoredAccent(): void {
  document.documentElement.style.setProperty('--accent', loadAccent())
}

export function onAccentChange(cb: (color: string) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
