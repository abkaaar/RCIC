/**
 * chartDraw — lightweight Pixi chart paths for bar/line/pie/doughnut (ISS-047).
 */
import { Graphics } from 'pixi.js'

const PALETTE = [0x7c5cff, 0xff6b6b, 0xffb020, 0x22c55e, 0x38bdf8, 0xf472b6, 0x475569]

export function drawChart(
  g: Graphics,
  opts: {
    w: number
    h: number
    chartType: string
    values: number[]
  },
): void {
  g.clear()
  const vals = opts.values.map((v) => (Number.isFinite(v) ? v : 0))
  const pad = 16
  const w = Math.max(40, opts.w - pad * 2)
  const h = Math.max(40, opts.h - pad * 2)
  const max = Math.max(1, ...vals, 1)

  g.roundRect(-opts.w / 2, -opts.h / 2, opts.w, opts.h, 10).fill(0xffffff).stroke({ width: 1.5, color: 0xe2e8f0 })

  if (opts.chartType === 'pie' || opts.chartType === 'doughnut') {
    const sum = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1
    let angle = -Math.PI / 2
    const r = Math.min(w, h) / 2 - 4
    for (let i = 0; i < vals.length; i++) {
      const slice = (Math.max(0, vals[i]!) / sum) * Math.PI * 2
      g.moveTo(0, 0)
      g.arc(0, 0, r, angle, angle + slice)
      g.lineTo(0, 0)
      g.fill(PALETTE[i % PALETTE.length]!)
      angle += slice
    }
    if (opts.chartType === 'doughnut') {
      g.circle(0, 0, r * 0.45).fill(0xffffff)
    }
    return
  }

  if (opts.chartType === 'line') {
    const n = Math.max(1, vals.length - 1)
    g.moveTo(-w / 2, h / 2)
    g.lineTo(w / 2, h / 2)
    g.stroke({ width: 1, color: 0xe2e8f0 })
    if (vals.length) {
      for (let i = 0; i < vals.length; i++) {
        const x = -w / 2 + (i / n) * w
        const y = h / 2 - (vals[i]! / max) * h
        if (i === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke({ width: 2.5, color: PALETTE[0]!, cap: 'round', join: 'round' })
      for (let i = 0; i < vals.length; i++) {
        const x = -w / 2 + (i / n) * w
        const y = h / 2 - (vals[i]! / max) * h
        g.circle(x, y, 3.5).fill(PALETTE[0]!)
      }
    }
    return
  }

  const gap = 6
  const bw = Math.max(6, (w - gap * (vals.length + 1)) / Math.max(1, vals.length))
  for (let i = 0; i < vals.length; i++) {
    const bh = (vals[i]! / max) * h
    const x = -w / 2 + gap + i * (bw + gap)
    const y = h / 2 - bh
    g.roundRect(x, y, bw, Math.max(2, bh), 3).fill(PALETTE[i % PALETTE.length]!)
  }
}
