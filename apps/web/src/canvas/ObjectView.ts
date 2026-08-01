/**
 * ObjectView — Pixi display for one canvas object.
 * Positions are object centers (matches Matter bodies). Redraw only when a cheap fingerprint changes.
 */
import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import type { CanvasObject } from '@rcic/shared'
import { drawShapeKind } from '../shapes/draw'
import { rasterizeRichText } from '../shapes/textRaster'
import { drawChart } from '../shapes/chartDraw'

const textureCache = new Map<string, Promise<Texture>>()

function loadTexture(src: string): Promise<Texture> {
  let p = textureCache.get(src)
  if (!p) {
    p = new Promise<Texture>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(Texture.from(img))
      img.onerror = reject
      img.src = src
    })
    textureCache.set(src, p)
  }
  return p
}

function seededBars(id: string, n: number): number[] {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    h = (h * 1103515245 + 12345) >>> 0
    out.push(0.25 + (h % 1000) / 1400)
  }
  return out
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Cheap dirty key — avoid JSON.stringify of full data payloads every update. */
function fingerprint(obj: CanvasObject, playing: boolean, labelHidden: boolean, votes = 0): string {
  const d = obj.data ?? {}
  const text = typeof d.text === 'string' ? d.text : ''
  const html = typeof d.html === 'string' ? d.html : ''
  const kind = d.kind ?? d.style ?? ''
  const srcLen = typeof d.src === 'string' ? d.src.length : 0
  const fontSize = d.fontSize ?? ''
  const fontFamily = d.fontFamily ?? ''
  const align = d.align ?? ''
  const dur = d.duration ?? ''
  const mid = d.mid ? `${d.mid.x | 0},${d.mid.y | 0}` : ''
  const pts = Array.isArray(d._pts) ? d._pts.length : 0
  const author = d.author ?? ''
  const title = d.title ?? ''
  const inkPoints = Array.isArray(d.points) ? d.points : []
  const source = typeof d.source === 'string' ? d.source : ''
  return [
    obj.type,
    obj.w | 0,
    obj.h | 0,
    obj.x | 0,
    obj.y | 0,
    obj.color,
    obj.physics.enabled ? 1 : 0,
    obj.physics.mode,
    playing ? 1 : 0,
    labelHidden ? 1 : 0,
    kind,
    text.length,
    text.slice(0, 24),
    html.length,
    html.slice(0, 40),
    srcLen,
    fontSize,
    fontFamily,
    align,
    dur,
    mid,
    pts,
    d.from?.objectId ?? d.from?.x ?? '',
    d.to?.objectId ?? d.to?.x ?? '',
    d.from?.kind ?? '',
    d.to?.kind ?? '',
    author,
    d.resolved ? 1 : 0,
    title,
    d.mode ?? '',
    d.width ?? '',
    inkPoints.length,
    inkPoints.length ? `${inkPoints[inkPoints.length - 1]?.x},${inkPoints[inkPoints.length - 1]?.y}` : '',
    d.emoji ?? '',
    d.language ?? '',
    source.length,
    source.slice(0, 32),
    d.question ?? '',
    Array.isArray(d.options)
      ? d.options.map((o: { id?: string; label?: string }) => `${o.id}:${o.label ?? ''}`).join(',')
      : '',
    // Full vote digest so label/tally changes always redraw (ISS-045).
    JSON.stringify(d.votes ?? {}),
    d.cols ?? '',
    d.rows ?? '',
    Array.isArray(d.cells) ? JSON.stringify(d.cells) : '',
    d.chartType ?? '',
    Array.isArray(d.values) ? d.values.join(',') : '',
    d.sourceTableId ?? '',
    votes,
  ].join('|')
}

export class ObjectView {
  readonly root = new Container()
  private gfx = new Graphics()
  private label: Text | null = null
  private sprite: Sprite | null = null

  obj!: CanvasObject
  tx = 0
  ty = 0
  trot = 0
  playing = false
  labelHidden = false
  voteCount = 0
  private key = ''
  private destroyed = false
  private textResolution = 1

  constructor(readonly id: string) {
    this.root.addChild(this.gfx)
  }

  setTextResolution(r: number): void {
    if (Math.abs(r - this.textResolution) < 0.01) return
    this.textResolution = r
    if (this.label) {
      this.label.resolution = r
      this.label.style = this.label.style
    }
  }

  // ---------- fingerprint / update ----------

  setVoteCount(n: number): void {
    if (this.voteCount === n) return
    this.voteCount = n
    this.key = ''
    if (this.obj) this.update(this.obj, false)
  }

  update(obj: CanvasObject, immediate: boolean): void {
    this.obj = obj
    this.tx = obj.x
    this.ty = obj.y
    this.trot = obj.rotation
    if (immediate) this.snap()

    const key = fingerprint(obj, this.playing, this.labelHidden, this.voteCount)
    if (key !== this.key) {
      this.key = key
      this.redraw()
    }
    this.root.zIndex = visualZIndex(obj)
  }

  setPlaying(playing: boolean): void {
    if (this.playing === playing) return
    this.playing = playing
    this.key = ''
    if (this.obj) this.update(this.obj, false)
  }

  setLabelHidden(hidden: boolean): void {
    if (this.labelHidden === hidden) return
    this.labelHidden = hidden
    this.key = ''
    if (this.obj) this.update(this.obj, false)
  }

  // ---------- pose ----------

  /** Force sprite to store pose and ensure Pixi will draw it (ISS-007). */
  snapToStore(obj: CanvasObject): void {
    this.obj = obj
    this.tx = obj.x
    this.ty = obj.y
    this.trot = obj.rotation
    this.snap()
    this.root.visible = true
  }

  snap(): void {
    this.root.position.set(this.tx, this.ty)
    this.root.rotation = this.trot
  }

  tick(k: number): void {
    const dx = this.tx - this.root.x
    const dy = this.ty - this.root.y
    const dr = this.trot - this.root.rotation
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05 && Math.abs(dr) < 0.001) {
      this.snap()
      return
    }
    this.root.position.set(this.root.x + dx * k, this.root.y + dy * k)
    this.root.rotation += dr * k
  }

  private ensureLabel(): Text {
    if (!this.label) {
      this.label = new Text({
        text: '',
        resolution: this.textResolution,
        style: { fontFamily: 'Inter, system-ui, sans-serif', fill: 0x1f2430 },
      })
      this.root.addChild(this.label)
    }
    return this.label
  }

  private clearLabel(): void {
    if (this.label) {
      this.root.removeChild(this.label)
      this.label.destroy()
      this.label = null
    }
  }

  private clearTableCells(): void {
    for (const child of [...this.root.children]) {
      if ((child as any)._tableCell) {
        this.root.removeChild(child)
        child.destroy()
      }
    }
  }

  private clearSprite(): void {
    if (this.sprite) {
      this.root.removeChild(this.sprite)
      this.sprite.destroy()
      this.sprite = null
    }
  }

  private paintRichOrLabel(
    o: CanvasObject,
    w: number,
    h: number,
    color: string,
    defaultAlign: string,
    defaultSize: number,
  ): void {
    const html = String(o.data.html ?? '')
    const plain = String(o.data.text ?? '')
    const fontSize = Number(o.data.fontSize ?? defaultSize)
    const fontFamily = String(o.data.fontFamily ?? 'Inter')
    const align = String(o.data.align ?? defaultAlign)
    const rich = html.includes('<') && html !== plain

    if (rich || fontFamily !== 'Inter') {
      this.clearLabel()
      const expected = this.key
      rasterizeRichText({
        html: html || escapeHtml(plain),
        plain: plain || (o.type === 'sticky' ? 'Double-click to edit' : 'Type something'),
        w,
        h,
        fontSize,
        fontFamily,
        color,
        align,
        cacheKey: expected,
      })
        .then((tex) => {
          if (this.destroyed || this.key !== expected) return
          if (!this.sprite) {
            this.sprite = new Sprite(tex)
            this.sprite.anchor.set(0.5)
            this.root.addChild(this.sprite)
          } else {
            this.sprite.texture = tex
          }
          this.sprite.width = w
          this.sprite.height = h
        })
        .catch(() => {})
      return
    }

    this.clearSprite()
    const t = this.ensureLabel()
    t.text = plain || (o.type === 'sticky' ? 'Double-click to edit' : 'Type something')
    t.alpha = plain ? 1 : 0.35
    t.style.fontSize = fontSize
    t.style.fontFamily = `"${fontFamily}", system-ui, sans-serif`
    t.style.wordWrap = true
    t.style.wordWrapWidth = Math.max(20, w - (o.type === 'sticky' ? 28 : 12))
    t.style.align = align as 'left' | 'center' | 'right'
    t.style.fill = color
    if (o.type === 'sticky') {
      t.anchor.set(0.5)
      t.position.set(0, 0)
    } else {
      t.anchor.set(align === 'center' ? 0.5 : align === 'right' ? 1 : 0, 0.5)
      t.position.set(align === 'center' ? 0 : align === 'right' ? w / 2 - 6 : -w / 2 + 6, 0)
    }
  }

  // ---------- redraw ----------

  private redraw(): void {
    const o = this.obj
    const { w, h } = o
    const g = this.gfx
    g.clear()

    switch (o.type) {
      case 'sticky': {
        this.clearSprite()
        g.roundRect(-w / 2 + 3, -h / 2 + 5, w, h, 10).fill({ color: 0x000000, alpha: 0.08 })
        g.roundRect(-w / 2, -h / 2, w, h, 10)
          .fill(o.color)
          .stroke({ width: 1, color: 0x000000, alpha: 0.08 })
        if (this.labelHidden) {
          g.roundRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 6).stroke({ width: 1.5, color: 0x64748b, alpha: 0.35 })
          this.clearLabel()
        } else {
          this.paintRichOrLabel(o, w, h, '#27303f', 'center', 20)
        }
        break
      }
      case 'text': {
        if (this.labelHidden) {
          this.clearSprite()
          g.roundRect(-w / 2, -h / 2, w, h, 4)
            .fill({ color: 0xffffff, alpha: 0.55 })
            .stroke({ width: 1.5, color: 0x7c5cff, alpha: 0.5 })
          this.clearLabel()
        } else {
          g.clear()
          this.paintRichOrLabel(o, w, h, o.color, 'left', 28)
        }
        break
      }
      case 'comment': {
        this.clearSprite()
        // Smooth teardrop: round head + soft tip (ISS-021)
        const fill = parseColor(o.color)
        const r = Math.min(w, h) * 0.38
        const cy = -h * 0.12
        const tipY = h / 2 - 3
        g.moveTo(0, tipY)
        g.quadraticCurveTo(-r * 0.85, tipY * 0.35, -r, cy)
        g.arc(0, cy, r, Math.PI, 0, false)
        g.quadraticCurveTo(r * 0.85, tipY * 0.35, 0, tipY)
        g.fill(fill).stroke({ width: 2, color: 0xffffff, alpha: 0.95 })
        const initial =
          String(o.data.author ?? '?')
            .trim()
            .charAt(0)
            .toUpperCase() || '?'
        const t = this.ensureLabel()
        t.text = initial
        t.style.fontSize = 13
        t.style.fill = 0xffffff
        t.style.fontWeight = '700'
        t.anchor.set(0.5)
        t.position.set(0, cy)
        break
      }
      case 'section': {
        this.clearSprite()
        const stroke = parseColor(o.color)
        g.roundRect(-w / 2, -h / 2, w, h, 8)
          .fill({ color: 0xffffff, alpha: 0.72 })
          .stroke({ width: 1.5, color: stroke, alpha: 0.55 })
        // Title pill sits above top-left (drawn in local space)
        const title = String(o.data.title ?? 'Section') || 'Section'
        const pillW = Math.min(w - 16, Math.max(88, title.length * 7.5 + 36))
        const pillH = 26
        const px = -w / 2 + 4
        const py = -h / 2 - pillH - 6
        g.roundRect(px, py, pillW, pillH, 8)
          .fill({ color: 0xe8eaee, alpha: 0.98 })
          .stroke({ width: 1, color: 0x000000, alpha: 0.06 })
        // tiny layout glyph
        g.roundRect(px + 8, py + 7, 10, 12, 2).stroke({ width: 1.4, color: 0x64748b })
        g.rect(px + 10, py + 9, 2.5, 8).fill(0x64748b)
        g.rect(px + 13.5, py + 9, 2.5, 8).fill(0x64748b)
        const t = this.ensureLabel()
        t.text = title
        t.style.fontSize = 12
        t.style.fontWeight = '600'
        t.style.fill = 0x475569
        t.style.wordWrap = false
        t.anchor.set(0, 0.5)
        t.position.set(px + 26, py + pillH / 2)
        break
      }
      case 'ink': {
        this.clearSprite()
        this.clearLabel()
        const points = Array.isArray(o.data.points) ? (o.data.points as { x: number; y: number }[]) : []
        if (points.length === 1) {
          g.circle(points[0]!.x, points[0]!.y, Number(o.data.width ?? 4) / 2).fill({
            color: parseColor(o.color),
            alpha: o.data.mode === 'highlighter' ? 0.35 : 1,
          })
        } else if (points.length > 1) {
          g.moveTo(points[0]!.x, points[0]!.y)
          for (let i = 1; i < points.length; i++) g.lineTo(points[i]!.x, points[i]!.y)
          g.stroke({
            width: Number(o.data.width ?? 4),
            color: parseColor(o.color),
            alpha: o.data.mode === 'highlighter' ? 0.35 : 1,
            cap: 'round',
            join: 'round',
          })
        }
        break
      }
      case 'sticker': {
        this.clearSprite()
        const emoji = String(o.data.emoji ?? '⭐')
        const size = Math.max(24, Math.min(o.w, o.h) * 0.85)
        const t = this.ensureLabel()
        t.text = emoji
        t.style = {
          fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif',
          fontSize: size,
          align: 'center',
        } as any
        t.anchor.set(0.5)
        t.position.set(0, 0)
        t.visible = true
        break
      }
      case 'code': {
        this.clearSprite()
        g.roundRect(-w / 2, -h / 2, w, h, 10).fill(0x0f172a).stroke({ width: 1.5, color: 0x334155 })
        const lang = String(o.data.language ?? 'plain')
        const src = String(o.data.source ?? '')
        const lines = src.split('\n').slice(0, Math.max(3, Math.floor(h / 18)))
        const t = this.ensureLabel()
        t.text = `${lang}\n${lines.join('\n')}`
        t.style = {
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: Math.max(10, Math.min(14, w / 28)),
          fill: 0xe2e8f0,
          align: 'left',
          wordWrap: true,
          wordWrapWidth: w - 24,
          lineHeight: 18,
        } as any
        t.anchor.set(0, 0)
        t.position.set(-w / 2 + 12, -h / 2 + 10)
        t.visible = !this.labelHidden
        break
      }
      case 'poll': {
        this.clearSprite()
        g.roundRect(-w / 2, -h / 2, w, h, 12).fill(0xffffff).stroke({ width: 1.5, color: 0xe2e8f0 })
        const question = String(o.data.question ?? 'Poll')
        const options = Array.isArray(o.data.options) ? o.data.options : []
        const votes = (o.data.votes ?? {}) as Record<string, Record<string, true>>
        let total = 0
        for (const opt of options) {
          const id = String(opt.id ?? '')
          total += Object.keys(votes[id] ?? {}).length
        }
        const t = this.ensureLabel()
        const rows = options.slice(0, 6).map((opt: { id?: string; label?: string }) => {
          const id = String(opt.id ?? '')
          const c = Object.keys(votes[id] ?? {}).length
          const pct = total ? Math.round((c / total) * 100) : 0
          return `${opt.label ?? id}: ${c} (${pct}%)`
        })
        t.text = `${question}\n${rows.join('\n')}`
        t.style = {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 13,
          fill: 0x1f2430,
          align: 'left',
          wordWrap: true,
          wordWrapWidth: w - 24,
          lineHeight: 20,
        } as any
        t.anchor.set(0, 0)
        t.position.set(-w / 2 + 12, -h / 2 + 12)
        t.visible = true
        // Bars sit below the text block (1 question line + N option lines).
        const textBlockH = 20 * (1 + Math.min(6, options.length)) + 8
        let y = -h / 2 + 12 + textBlockH
        const maxBars = Math.min(5, options.length)
        for (let i = 0; i < maxBars; i++) {
          if (y + 10 > h / 2 - 8) break
          const opt = options[i]
          const id = String(opt?.id ?? '')
          const c = Object.keys(votes[id] ?? {}).length
          const pct = total ? c / total : 0
          const barW = (w - 24) * pct
          g.roundRect(-w / 2 + 12, y, w - 24, 8, 4).fill(0xf1f5f9)
          if (barW > 0) g.roundRect(-w / 2 + 12, y, barW, 8, 4).fill(0x7c5cff)
          y += 14
        }
        break
      }
      case 'table': {
        this.clearSprite()
        this.clearLabel()
        this.clearTableCells()
        g.roundRect(-w / 2, -h / 2, w, h, 8).fill(0xffffff).stroke({ width: 1.5, color: 0xcbd5e1 })
        const cols = Math.max(1, Number(o.data.cols ?? 3))
        const rows = Math.max(1, Number(o.data.rows ?? 3))
        const cells = Array.isArray(o.data.cells) ? o.data.cells : []
        const cw = w / cols
        const rh = h / rows
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x0 = -w / 2 + c * cw
            const y0 = -h / 2 + r * rh
            if (r === 0) g.rect(x0, y0, cw, rh).fill({ color: 0xf8fafc, alpha: 1 })
            g.rect(x0, y0, cw, rh).stroke({ width: 1, color: 0xe2e8f0 })
          }
        }
        const fontSize = Math.max(9, Math.min(13, rh * 0.42))
        for (let r = 0; r < rows; r++) {
          const row = Array.isArray(cells[r]) ? cells[r] : []
          for (let c = 0; c < cols; c++) {
            const text = String(row?.[c] ?? '')
            if (!text) continue
            const label = new Text({
              text: text.length > 18 ? `${text.slice(0, 17)}…` : text,
              resolution: this.textResolution,
              style: {
                fontFamily: 'Inter, system-ui',
                fontSize,
                fill: r === 0 ? 0x1e293b : 0x334155,
                fontWeight: r === 0 ? '600' : '400',
              },
            })
            label.anchor.set(0, 0.5)
            label.position.set(-w / 2 + c * cw + 4, -h / 2 + r * rh + rh / 2)
            if (label.width > cw - 8) {
              label.scale.x = (cw - 8) / label.width
            }
            ;(label as any)._tableCell = true
            this.root.addChild(label)
          }
        }
        break
      }
      case 'chart': {
        this.clearSprite()
        this.clearLabel()
        const values = Array.isArray(o.data.values) ? o.data.values.map(Number) : [1, 2, 3]
        drawChart(g, {
          w,
          h,
          chartType: String(o.data.chartType ?? 'bar'),
          values,
        })
        break
      }
      case 'shape': {
        this.clearSprite()
        this.clearLabel()
        const kind = String(o.data.kind ?? 'rect')
        drawShapeKind(g, kind, w, h, o.color)
        break
      }
      case 'connector': {
        this.clearSprite()
        this.clearLabel()
        const pts = Array.isArray(o.data._pts) ? (o.data._pts as { x: number; y: number }[]) : null
        const style = String(o.data.style ?? 'curve')
        if (pts && pts.length >= 2) {
          const ox = o.x
          const oy = o.y
          g.moveTo(pts[0]!.x - ox, pts[0]!.y - oy)
          for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x - ox, pts[i]!.y - oy)
          g.stroke({ width: 2.5, color: 0x475569, alpha: 0.9 })
          if (style === 'arrow' || style === 'curve' || style === 'elbow') {
            const a = pts[pts.length - 2]!
            const b = pts[pts.length - 1]!
            const ang = Math.atan2(b.y - a.y, b.x - a.x)
            const len = 12
            const bx = b.x - ox
            const by = b.y - oy
            g.moveTo(bx, by)
            g.lineTo(bx - Math.cos(ang - 0.4) * len, by - Math.sin(ang - 0.4) * len)
            g.moveTo(bx, by)
            g.lineTo(bx - Math.cos(ang + 0.4) * len, by - Math.sin(ang + 0.4) * len)
            g.stroke({ width: 2.5, color: 0x475569, alpha: 0.9 })
          }
        } else {
          g.moveTo(-w / 2, 0).lineTo(w / 2, 0).stroke({ width: 2.5, color: 0x475569, alpha: 0.9 })
        }
        break
      }
      case 'image': {
        this.clearLabel()
        g.roundRect(-w / 2, -h / 2, w, h, 8).fill(0xe5e7eb).stroke({ width: 1, color: 0x000000, alpha: 0.1 })
        const src = String(o.data.src ?? '')
        if (src) {
          const expected = this.key
          loadTexture(src)
            .then((tex) => {
              if (this.destroyed || this.key !== expected) return
              if (!this.sprite) {
                this.sprite = new Sprite(tex)
                this.sprite.anchor.set(0.5)
                this.root.addChild(this.sprite)
              } else {
                this.sprite.texture = tex
              }
              this.sprite.width = w
              this.sprite.height = h
            })
            .catch(() => {})
        }
        if (this.sprite) {
          this.sprite.width = w
          this.sprite.height = h
        }
        break
      }
      case 'audio': {
        this.clearSprite()
        g.roundRect(-w / 2 + 2, -h / 2 + 4, w, h, 14).fill({ color: 0x000000, alpha: 0.07 })
        g.roundRect(-w / 2, -h / 2, w, h, 14)
          .fill(0xffffff)
          .stroke({ width: 1, color: 0x000000, alpha: 0.1 })
        const cx = -w / 2 + 30
        g.circle(cx, 0, 17).fill(o.color)
        if (this.playing) {
          g.rect(cx - 6, -6, 4.5, 12).fill(0xffffff)
          g.rect(cx + 1.5, -6, 4.5, 12).fill(0xffffff)
        } else {
          g.poly([cx - 4, -7, cx + 8, 0, cx - 4, 7]).fill(0xffffff)
        }
        const bars = seededBars(o.id, 14)
        const barArea = w - 110
        const bw = Math.max(2, barArea / 14 - 3)
        bars.forEach((bh, i) => {
          const bx = -w / 2 + 58 + i * (barArea / 14)
          const half = (h * 0.42 * bh) / 2
          g.roundRect(bx, -half, bw, half * 2, 2).fill({ color: 0x94a3b8, alpha: 0.9 })
        })
        const t = this.ensureLabel()
        t.text = formatDuration(Number(o.data.duration ?? 0))
        t.style.fontSize = 13
        t.style.fill = 0x64748b
        t.style.wordWrap = false
        t.anchor.set(1, 0.5)
        t.position.set(w / 2 - 10, 0)
        break
      }
    }

    if (o.type !== 'section' && o.type !== 'comment' && o.physics.enabled && o.physics.mode !== 'normal') {
      g.circle(w / 2 - 8, -h / 2 + 8, 6)
        .fill(o.physics.mode === 'attract' ? 0x22c55e : 0xef4444)
        .stroke({ width: 2, color: 0xffffff })
    }

    if (this.voteCount > 0) {
      g.circle(-w / 2 + 14, -h / 2 + 14, 12).fill(0x7c5cff).stroke({ width: 2, color: 0xffffff })
      const vt = new Text({
        text: String(this.voteCount),
        style: { fontFamily: 'Inter, system-ui', fontSize: 11, fill: 0xffffff, fontWeight: '700' },
      })
      vt.anchor.set(0.5)
      vt.position.set(-w / 2 + 14, -h / 2 + 14)
      this.root.addChild(vt)
      // destroy previous vote label on next clear — tag for cleanup
      if ((this as any)._voteLabel) {
        this.root.removeChild((this as any)._voteLabel)
        ;(this as any)._voteLabel.destroy()
      }
      ;(this as any)._voteLabel = vt
    } else if ((this as any)._voteLabel) {
      this.root.removeChild((this as any)._voteLabel)
      ;(this as any)._voteLabel.destroy()
      ;(this as any)._voteLabel = null
    }
  }

  // ---------- destroy ----------

  destroy(): void {
    this.destroyed = true
    this.clearTableCells()
    this.root.destroy({ children: true })
  }
}

/** Pixi draw order: sections under content; comments always on top (ISS-020/021). */
export function visualZIndex(obj: CanvasObject): number {
  if (obj.type === 'section') return obj.z
  if (obj.type === 'comment') return 1_000_000 + obj.z
  return 10_000 + obj.z
}

function parseColor(color: string): number {
  const s = color.startsWith('#') ? color.slice(1) : color
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16)
  return Number.isFinite(n) ? n : 0x7c5cff
}

function escapeHtml(t: string): string {
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')
}
