/** SelectionPanel — color/physics/rotate controls for the selected object. */
import { useEffect, useState } from 'react'
import { Copy, Plus, RotateCcw, RotateCw, Trash2 } from 'lucide-react'
import { OBJECT_COLORS, STICKY_COLORS, type CanvasObject, type PhysicsMode } from '@rcic/shared'
import type { Camera } from '../canvas/CanvasApp'
import { clampCenteredLeft } from './viewportClamp'

const MODES: { key: PhysicsMode | 'off'; label: string; title: string }[] = [
  { key: 'off', label: 'Off', title: 'No physics' },
  { key: 'normal', label: 'On', title: 'Collides and can be thrown' },
  { key: 'attract', label: 'Pull', title: 'Attracts nearby objects' },
  { key: 'repel', label: 'Push', title: 'Repels nearby objects' },
]

const ROTATE_STEP = 15

function degFromRad(r: number): number {
  let d = Math.round((r * 180) / Math.PI) % 360
  if (d < 0) d += 360
  return d
}

function normDeg(n: number): number {
  return ((Math.round(n) % 360) + 360) % 360
}

export function SelectionPanel(props: {
  obj: CanvasObject
  camera: Camera
  onColor(color: string): void
  onPhysics(mode: PhysicsMode | 'off'): void
  onRotate?(deg: number): void
  onChartType?(t: 'bar' | 'line' | 'pie' | 'doughnut'): void
  onDuplicate(): void
  onDelete(): void
}) {
  const { obj, camera } = props
  const sx = (obj.x - camera.x) * camera.scale
  const sy = (obj.y - obj.h / 2 - camera.y) * camera.scale - 56
  const panelW = Math.min(360, typeof window !== 'undefined' ? window.innerWidth - 16 : 360)
  const left = clampCenteredLeft(sx, panelW)
  const top = Math.max(8, sy)
  const colors = obj.type === 'sticky' ? STICKY_COLORS : OBJECT_COLORS
  const activeMode: PhysicsMode | 'off' = obj.physics.enabled ? obj.physics.mode : 'off'
  const isConnector = obj.type === 'connector'
  const isComment = obj.type === 'comment'
  const isSection = obj.type === 'section'
  const isInk = obj.type === 'ink'
  const isSticker = obj.type === 'sticker'
  const isAdvanced = obj.type === 'code' || obj.type === 'poll' || obj.type === 'table' || obj.type === 'chart'
  const canRotate = !isConnector && !isComment && !isSection && !isInk && !isSticker && !isAdvanced && props.onRotate
  const [deg, setDeg] = useState(() => degFromRad(obj.rotation))

  useEffect(() => {
    setDeg(degFromRad(obj.rotation))
  }, [obj.id, obj.rotation])

  const nudge = (delta: number) => {
    if (!props.onRotate) return
    const next = normDeg(deg + delta)
    setDeg(next)
    props.onRotate(next)
  }

  const showColorRow = !isConnector && obj.type !== 'image' && obj.type !== 'audio' && !isComment && !isSticker && !isAdvanced
  const colorList = isInk
    ? ['#1f2430', '#ef4444', '#f97316', '#fbbf24', '#22c55e', '#38bdf8', '#7c5cff', ...OBJECT_COLORS]
    : colors

  return (
    <div
      className="floating-panel selection-panel"
      style={{ left, top: Math.max(8, top) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {showColorRow && (
        <>
          <div className="color-row">
            {[...new Set(colorList)].map((c) => (
              <button
                key={c}
                type="button"
                className={`color-dot ${obj.color === c ? 'color-dot-active' : ''}`}
                style={{ background: c }}
                onClick={() => props.onColor(c)}
              />
            ))}
            {isInk && (
              <label className="ink-color-custom selection-color-custom" title="Custom color">
                <Plus size={12} />
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/i.test(obj.color) ? obj.color : '#1f2430'}
                  aria-label="Custom color"
                  onChange={(e) => props.onColor(e.target.value)}
                />
              </label>
            )}
          </div>
          <div className="toolbar-divider" />
        </>
      )}
      {obj.type === 'chart' && props.onChartType && (
        <>
          <div className="mode-row">
            {(['bar', 'line', 'pie', 'doughnut'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`mode-btn ${obj.data.chartType === t ? 'mode-active' : ''}`}
                onClick={() => props.onChartType?.(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="toolbar-divider" />
        </>
      )}
      {canRotate && (
        <>
          <div className="rotate-deg" title="Rotation">
            <button type="button" className="icon-btn" title="Rotate left 15°" aria-label="Rotate left" onClick={() => nudge(-ROTATE_STEP)}>
              <RotateCcw size={16} strokeWidth={2.25} />
            </button>
            <span className="rotate-deg-value">{deg}°</span>
            <button type="button" className="icon-btn" title="Rotate right 15°" aria-label="Rotate right" onClick={() => nudge(ROTATE_STEP)}>
              <RotateCw size={16} strokeWidth={2.25} />
            </button>
          </div>
          <div className="toolbar-divider" />
        </>
      )}
      {!isConnector && !isComment && !isSection && !isInk && !isSticker && !isAdvanced && (
        <>
          <div className="mode-row">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                title={m.title}
                className={`mode-btn ${activeMode === m.key ? 'mode-active' : ''}`}
                onClick={() => props.onPhysics(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="toolbar-divider" />
        </>
      )}
      {!isConnector && !isComment && (
        <button type="button" className="icon-btn" title="Duplicate" onClick={props.onDuplicate}>
          <Copy size={15} />
        </button>
      )}
      <button type="button" className="icon-btn icon-danger" title="Delete" onClick={props.onDelete}>
        <Trash2 size={15} />
      </button>
    </div>
  )
}
