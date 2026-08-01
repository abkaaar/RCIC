/**
 * exporters — PNG/SVG/JSON downloads. Snapshot uses the live Pixi stage; JSON dumps RoomStore objects.
 */
import type { Application, Container } from 'pixi.js'
import type { CanvasObject } from '@rcic/shared'
import { isConnectorKind, shapePolygon, shapeSvgPath } from '../shapes/geometry'

function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function exportJSON(roomId: string, roomName: string, objects: CanvasObject[]): void {
  const payload = {
    app: 'rcic',
    version: 1,
    roomId,
    name: roomName,
    exportedAt: new Date().toISOString(),
    objects,
  }
  download(`${roomName || roomId}.json`, new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
}

export function exportPNG(app: Application, world: Container, roomName: string): void {
  const canvas = app.renderer.extract.canvas({ target: world, resolution: 2 }) as HTMLCanvasElement
  canvas.toBlob?.((blob) => {
    if (blob) download(`${roomName || 'board'}.png`, blob)
  }, 'image/png')
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function svgShape(kind: string, w: number, h: number, color: string, tf: string): string {
  const strokeOnly = isConnectorKind(kind) || kind === 'actor' || kind === 'brace'
  const stroke = strokeOnly
    ? `fill="none" stroke="#1f2430" stroke-width="3"`
    : `fill="${color}" stroke="rgba(0,0,0,0.12)" stroke-width="2"`
  const path = shapeSvgPath(kind, w, h)
  if (path) {
    return `<path ${tf} d="${path}" ${stroke} fill-rule="evenodd"/>`
  }
  const poly = shapePolygon(kind, w, h)
  if (poly.length >= 6) {
    const pts: string[] = []
    for (let i = 0; i < poly.length; i += 2) pts.push(`${poly[i]},${poly[i + 1]}`)
    return `<polygon ${tf} points="${pts.join(' ')}" ${stroke}/>`
  }
  return `<rect ${tf} x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="10" fill="${color}"/>`
}

export function exportSVG(objects: CanvasObject[], roomName: string): void {
  if (objects.length === 0) return
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const o of objects) {
    const r = Math.max(o.w, o.h) / 2
    minX = Math.min(minX, o.x - r)
    minY = Math.min(minY, o.y - r)
    maxX = Math.max(maxX, o.x + r)
    maxY = Math.max(maxY, o.y + r)
  }
  const pad = 40
  minX -= pad
  minY -= pad
  maxX += pad
  maxY += pad

  const parts: string[] = []
  const sorted = objects.slice().sort((a, b) => a.z - b.z)
  for (const o of sorted) {
    const deg = (o.rotation * 180) / Math.PI
    const tf = `transform="translate(${o.x} ${o.y}) rotate(${deg.toFixed(2)})"`
    switch (o.type) {
      case 'shape': {
        parts.push(svgShape(String(o.data.kind ?? 'rect'), o.w, o.h, o.color, tf))
        break
      }
      case 'connector': {
        const pts = Array.isArray(o.data._pts) ? (o.data._pts as { x: number; y: number }[]) : null
        if (pts && pts.length >= 2) {
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
          parts.push(`<path d="${d}" fill="none" stroke="#475569" stroke-width="2.5"/>`)
        }
        break
      }
      case 'sticky': {
        const html = typeof o.data.html === 'string' && o.data.html.includes('<') ? o.data.html : null
        const body = html
          ? `<foreignObject x="${-o.w / 2 + 8}" y="${-o.h / 2 + 8}" width="${o.w - 16}" height="${o.h - 16}"><div xmlns="http://www.w3.org/1999/xhtml" style="font:${Number(o.data.fontSize ?? 20)}px ${esc(String(o.data.fontFamily ?? 'Inter'))};color:#27303f;text-align:${esc(String(o.data.align ?? 'center'))};overflow:hidden">${html}</div></foreignObject>`
          : svgText(String(o.data.text ?? ''), 0, 0, Number(o.data.fontSize ?? 20), '#27303f', 'middle', o.w - 28)
        parts.push(`<g ${tf}><rect x="${-o.w / 2}" y="${-o.h / 2}" width="${o.w}" height="${o.h}" rx="10" fill="${o.color}"/>${body}</g>`)
        break
      }
      case 'text': {
        const html = typeof o.data.html === 'string' && o.data.html.includes('<') ? o.data.html : null
        const align = String(o.data.align ?? 'left')
        const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'
        const tx = align === 'center' ? 0 : align === 'right' ? o.w / 2 - 6 : -o.w / 2 + 6
        const body = html
          ? `<foreignObject x="${-o.w / 2}" y="${-o.h / 2}" width="${o.w}" height="${o.h}"><div xmlns="http://www.w3.org/1999/xhtml" style="font:${Number(o.data.fontSize ?? 28)}px ${esc(String(o.data.fontFamily ?? 'Inter'))};color:${esc(o.color)};text-align:${esc(align)};overflow:hidden">${html}</div></foreignObject>`
          : svgText(String(o.data.text ?? ''), tx, 0, Number(o.data.fontSize ?? 28), o.color, anchor, o.w - 12)
        parts.push(`<g ${tf}>${body}</g>`)
        break
      }
      case 'comment': {
        const fill = o.color || '#7c5cff'
        const initial = esc(String(o.data.author ?? '?').trim().charAt(0).toUpperCase() || '?')
        parts.push(
          `<g ${tf}><path d="M0 16 C0 16 -9 4 -9 -2 A9 9 0 0 1 9 -2 C9 4 0 16 0 16 Z" fill="${fill}" stroke="#fff" stroke-width="1.5"/>` +
            `<text x="0" y="-2" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="12" font-weight="700">${initial}</text></g>`,
        )
        break
      }
      case 'section': {
        const title = esc(String(o.data.title ?? 'Section'))
        parts.push(
          `<g ${tf}><rect x="${-o.w / 2}" y="${-o.h / 2}" width="${o.w}" height="${o.h}" rx="8" fill="rgba(255,255,255,0.72)" stroke="${esc(o.color)}" stroke-width="1.5"/>` +
            `<rect x="${-o.w / 2 + 4}" y="${-o.h / 2 - 32}" width="${Math.min(o.w - 16, Math.max(88, title.length * 7 + 36))}" height="26" rx="8" fill="#e8eaee"/>` +
            `<text x="${-o.w / 2 + 30}" y="${-o.h / 2 - 19}" font-size="12" font-weight="600" fill="#475569">${title}</text></g>`,
        )
        break
      }
      case 'ink': {
        const points = Array.isArray(o.data.points) ? (o.data.points as { x: number; y: number }[]) : []
        if (points.length > 0) {
          const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
          parts.push(
            `<path ${tf} d="${d}" fill="none" stroke="${esc(o.color)}" stroke-width="${Number(o.data.width ?? 4)}" stroke-linecap="round" stroke-linejoin="round" opacity="${o.data.mode === 'highlighter' ? 0.35 : 1}"/>`,
          )
        }
        break
      }
      case 'sticker': {
        const emoji = esc(String(o.data.emoji ?? '⭐'))
        const size = Math.max(24, Math.min(o.w, o.h) * 0.85)
        parts.push(
          `<text ${tf} x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="${size}">${emoji}</text>`,
        )
        break
      }
      case 'code': {
        const src = esc(String(o.data.source ?? '').slice(0, 400))
        parts.push(
          `<g ${tf}><rect x="${-o.w / 2}" y="${-o.h / 2}" width="${o.w}" height="${o.h}" rx="10" fill="#0f172a"/>` +
            svgText(src, 0, 0, 11, '#e2e8f0', 'middle', o.w - 20) +
            `</g>`,
        )
        break
      }
      case 'poll':
      case 'table':
      case 'chart': {
        parts.push(
          `<g ${tf}><rect x="${-o.w / 2}" y="${-o.h / 2}" width="${o.w}" height="${o.h}" rx="10" fill="white" stroke="#e2e8f0"/>` +
            svgText(o.type, 0, 0, 14, '#64748b', 'middle', o.w - 20) +
            `</g>`,
        )
        break
      }
      case 'image': {
        const src = String(o.data.src ?? '')
        if (src) {
          parts.push(`<image ${tf} x="${-o.w / 2}" y="${-o.h / 2}" width="${o.w}" height="${o.h}" href="${esc(src)}"/>`)
        }
        break
      }
      case 'audio': {
        parts.push(
          `<g ${tf}><rect x="${-o.w / 2}" y="${-o.h / 2}" width="${o.w}" height="${o.h}" rx="14" fill="white" stroke="#e2e8f0"/>` +
            `<circle cx="${-o.w / 2 + 30}" cy="0" r="17" fill="${o.color}"/>` +
            svgText('audio clip', 10, 0, 13, '#64748b', 'middle', o.w - 60) +
            `</g>`,
        )
        break
      }
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}">` +
    `<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="#f4f4f6"/>` +
    parts.join('') +
    `</svg>`
  download(`${roomName || 'board'}.svg`, new Blob([svg], { type: 'image/svg+xml' }))
}

function svgText(text: string, x: number, y: number, fontSize: number, fill: string, anchor: string, maxWidth: number): string {
  if (!text) return ''
  const perLine = Math.max(4, Math.floor(maxWidth / (fontSize * 0.55)))
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    if ((cur + ' ' + word).trim().length > perLine && cur) {
      lines.push(cur)
      cur = word
    } else {
      cur = (cur + ' ' + word).trim()
    }
  }
  if (cur) lines.push(cur)
  const lh = fontSize * 1.25
  const startY = y - ((lines.length - 1) * lh) / 2
  const spans = lines
    .map((l, i) => `<tspan x="${x}" y="${(startY + i * lh).toFixed(1)}">${esc(l)}</tspan>`)
    .join('')
  return `<text font-family="Inter, system-ui, sans-serif" font-size="${fontSize}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="middle">${spans}</text>`
}
