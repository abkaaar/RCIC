/**
 * Minimap — HUD overlay from object centers (store + physics override when owned).
 */
import { useEffect, useRef, useState } from 'react'
import { Map as MapIcon, X } from 'lucide-react'
import type { CanvasObject } from '@rcic/shared'
import { getAccent } from '../theme'
import type { Peer } from './types'

export interface MinimapSnapshot {
  objects: CanvasObject[]
  viewport: { x: number; y: number; w: number; h: number }
  peers: Peer[]
}

const W = 208
const H = 140
const MIN_MARK = 6

function markerColor(o: CanvasObject, accent: string): string {
  switch (o.type) {
    case 'sticky':
      return o.color || '#ffd166'
    case 'shape':
      return o.color || accent
    case 'text':
      return accent
    case 'audio':
      return accent
    case 'image':
      return '#64748b'
    case 'comment':
      return o.color || accent
    case 'section':
      return '#cbd5e1'
    case 'sticker':
      return accent
    case 'code':
      return '#0f172a'
    case 'poll':
    case 'table':
    case 'chart':
      return accent
    default:
      return '#94a3b8'
  }
}

export function Minimap(props: {
  getSnapshot(): MinimapSnapshot | null
  onJump(wx: number, wy: number): void
}) {
  const [open, setOpen] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boundsRef = useRef<{ x: number; y: number; s: number } | null>(null)

  useEffect(() => {
    if (!open) return
    let raf = 0
    let last = 0
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      if (t - last < 100) return
      last = t
      const canvas = canvasRef.current
      const snap = props.getSnapshot()
      if (!canvas || !snap) return
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, W, H)
      const accent = getAccent()

      // Object-first bounds
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      if (snap.objects.length === 0) {
        minX = snap.viewport.x
        minY = snap.viewport.y
        maxX = snap.viewport.x + snap.viewport.w
        maxY = snap.viewport.y + snap.viewport.h
      } else {
        for (const o of snap.objects) {
          minX = Math.min(minX, o.x - o.w / 2)
          minY = Math.min(minY, o.y - o.h / 2)
          maxX = Math.max(maxX, o.x + o.w / 2)
          maxY = Math.max(maxY, o.y + o.h / 2)
        }
      }

      const objW = Math.max(1, maxX - minX)
      const objH = Math.max(1, maxY - minY)
      const maxExpandX = objW * 3
      const maxExpandY = objH * 3

      const expandWith = (vx: number, vy: number, vw: number, vh: number) => {
        const nx0 = Math.max(minX - maxExpandX, Math.min(vx, minX))
        const ny0 = Math.max(minY - maxExpandY, Math.min(vy, minY))
        const nx1 = Math.min(maxX + maxExpandX, Math.max(vx + vw, maxX))
        const ny1 = Math.min(maxY + maxExpandY, Math.max(vy + vh, maxY))
        minX = nx0
        minY = ny0
        maxX = nx1
        maxY = ny1
      }

      expandWith(snap.viewport.x, snap.viewport.y, snap.viewport.w, snap.viewport.h)
      for (const p of snap.peers) {
        if (p.viewport) expandWith(p.viewport.x, p.viewport.y, p.viewport.w, p.viewport.h)
      }

      const padX = (maxX - minX) * 0.08 + 24
      const padY = (maxY - minY) * 0.08 + 24
      minX -= padX
      minY -= padY
      maxX += padX
      maxY += padY

      const s = Math.min(W / (maxX - minX), H / (maxY - minY))
      const ox = (W - (maxX - minX) * s) / 2 - minX * s
      const oy = (H - (maxY - minY) * s) / 2 - minY * s
      boundsRef.current = { x: ox, y: oy, s }

      const tx = (wx: number) => wx * s + ox
      const ty = (wy: number) => wy * s + oy

      // objects — type-colored, minimum size for visibility
      for (const o of snap.objects) {
        ctx.fillStyle = markerColor(o, accent)
        ctx.globalAlpha = 0.92
        if (o.type === 'comment') {
          const r = Math.max(3, 4 * s)
          ctx.beginPath()
          ctx.arc(tx(o.x), ty(o.y), r, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)'
          ctx.lineWidth = 1
          ctx.stroke()
          continue
        }
        if (o.type === 'ink') {
          const points = Array.isArray(o.data.points) ? (o.data.points as { x: number; y: number }[]) : []
          if (points.length > 0) {
            ctx.beginPath()
            points.forEach((p, i) => {
              const x = tx(o.x + p.x)
              const y = ty(o.y + p.y)
              if (i === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            })
            ctx.strokeStyle = o.color
            ctx.lineWidth = Math.max(1.5, Number(o.data.width ?? 4) * s)
            ctx.globalAlpha = o.data.mode === 'highlighter' ? 0.45 : 0.92
            ctx.stroke()
            ctx.globalAlpha = 1
          }
          continue
        }
        const mw = Math.max(MIN_MARK, o.w * s)
        const mh = Math.max(MIN_MARK, o.h * s)
        const x = tx(o.x) - mw / 2
        const y = ty(o.y) - mh / 2
        ctx.fillRect(x, y, mw, mh)
        ctx.globalAlpha = 1
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)'
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, y + 0.5, mw - 1, mh - 1)
      }

      // peer radar
      for (const p of snap.peers) {
        if (p.viewport) {
          ctx.strokeStyle = p.color
          ctx.lineWidth = 1
          ctx.globalAlpha = 0.55
          ctx.strokeRect(tx(p.viewport.x), ty(p.viewport.y), p.viewport.w * s, p.viewport.h * s)
          ctx.globalAlpha = 1
        }
        if (p.cursor) {
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(tx(p.cursor.x), ty(p.cursor.y), 3.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }

      ctx.strokeStyle = accent
      ctx.lineWidth = 1.75
      ctx.strokeRect(tx(snap.viewport.x), ty(snap.viewport.y), snap.viewport.w * s, snap.viewport.h * s)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [open, props])

  if (!open) {
    return (
      <button className="floating-panel minimap-toggle" title="Show mini-map" onClick={() => setOpen(true)}>
        <MapIcon size={16} />
      </button>
    )
  }

  return (
    <div className="floating-panel minimap">
      <button className="minimap-close" title="Hide mini-map" onClick={() => setOpen(false)}>
        <X size={12} />
      </button>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onClick={(e) => {
          const b = boundsRef.current
          if (!b) return
          const rect = e.currentTarget.getBoundingClientRect()
          const mx = e.clientX - rect.left
          const my = e.clientY - rect.top
          props.onJump((mx - b.x) / b.s, (my - b.y) / b.s)
        }}
      />
    </div>
  )
}
