/**
 * InkToolbar — marker modes, widths, and colors above the main toolbar (ISS-028/035).
 */
import { useMemo, useState } from 'react'
import { Highlighter, Plus } from 'lucide-react'
import { OBJECT_COLORS, type InkMode } from '@rcic/shared'
import iconMarker from '../assets/icons/tool-marker.png'
import iconEraser from '../assets/icons/tool-eraser.png'

const PRESET = ['#1f2430', '#ef4444', '#f97316', '#fbbf24', '#22c55e', '#38bdf8', '#7c5cff', ...OBJECT_COLORS]
const PRESET_UNIQUE = [...new Set(PRESET)]
const CUSTOMS_KEY = 'rcic-ink-customs'
const MAX_CUSTOMS = 6

function loadCustoms(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOMS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, MAX_CUSTOMS)
  } catch {
    return []
  }
}

function saveCustoms(colors: string[]): void {
  try {
    localStorage.setItem(CUSTOMS_KEY, JSON.stringify(colors.slice(0, MAX_CUSTOMS)))
  } catch {
    /* ignore */
  }
}

function normalizeHex(v: string): string {
  const s = v.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1]!
    const g = s[2]!
    const b = s[3]!
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return '#1f2430'
}

export function InkToolbar(props: {
  mode: InkMode
  width: 'thin' | 'thick'
  color: string
  onMode(mode: InkMode): void
  onWidth(width: 'thin' | 'thick'): void
  onColor(color: string): void
}) {
  const [customs, setCustoms] = useState(loadCustoms)
  const swatches = useMemo(() => {
    const out = [...PRESET_UNIQUE]
    for (const c of customs) {
      if (!out.includes(c)) out.push(c)
    }
    return out
  }, [customs])

  const pickCustom = (raw: string) => {
    const hex = normalizeHex(raw)
    props.onColor(hex)
    setCustoms((prev) => {
      const next = [hex, ...prev.filter((c) => c !== hex)].slice(0, MAX_CUSTOMS)
      saveCustoms(next)
      return next
    })
  }

  return (
    <div className="floating-panel ink-toolbar" role="toolbar" aria-label="Marker options">
      <button
        type="button"
        className={`ink-mode-btn${props.mode === 'pen' ? ' ink-active' : ''}`}
        title="Marker"
        onClick={() => props.onMode('pen')}
      >
        <img src={iconMarker} alt="Marker" className="tool-icon-img" draggable={false} />
      </button>
      <button
        type="button"
        className={`ink-mode-btn${props.mode === 'highlighter' ? ' ink-active' : ''}`}
        title="Highlighter"
        onClick={() => props.onMode('highlighter')}
      >
        <Highlighter size={18} />
      </button>
      <button
        type="button"
        className={`ink-mode-btn${props.mode === 'eraser' ? ' ink-active' : ''}`}
        title="Eraser"
        onClick={() => props.onMode('eraser')}
      >
        <img src={iconEraser} alt="Eraser" className="tool-icon-img" draggable={false} />
      </button>

      <div className="toolbar-divider" />

      <button
        type="button"
        className={`ink-size-btn${props.width === 'thin' ? ' ink-active' : ''}`}
        title="Thin"
        onClick={() => props.onWidth('thin')}
      >
        <span className="ink-size-line ink-size-thin" />
      </button>
      <button
        type="button"
        className={`ink-size-btn${props.width === 'thick' ? ' ink-active' : ''}`}
        title="Thick"
        onClick={() => props.onWidth('thick')}
      >
        <span className="ink-size-line ink-size-thick" />
      </button>

      <div className="toolbar-divider" />

      <div className="ink-colors">
        {swatches.map((color) => (
          <button
            key={color}
            type="button"
            className={`ink-color${props.color.toLowerCase() === color.toLowerCase() ? ' ink-color-active' : ''}`}
            style={{ background: color }}
            title={color}
            aria-label={`Ink color ${color}`}
            onClick={() => props.onColor(color)}
          />
        ))}
        <label className="ink-color-custom" title="Custom color">
          <Plus size={14} />
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/i.test(props.color) ? props.color : '#1f2430'}
            aria-label="Custom ink color"
            onFocus={() => {
              // Undo any scrollIntoView the browser applied when focusing the picker (ISS-054).
              const sx = window.scrollX
              const sy = window.scrollY
              requestAnimationFrame(() => {
                if (window.scrollX !== sx || window.scrollY !== sy) window.scrollTo(sx, sy)
              })
            }}
            onChange={(e) => pickCustom(e.target.value)}
          />
        </label>
      </div>
    </div>
  )
}
