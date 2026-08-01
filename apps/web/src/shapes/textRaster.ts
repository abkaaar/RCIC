/**
 * textRaster — paint rich HTML into a canvas texture for Pixi ObjectView (ISS-018).
 */
import { Texture } from 'pixi.js'

const cache = new Map<string, Promise<Texture>>()

export function rasterizeRichText(opts: {
  html: string
  plain: string
  w: number
  h: number
  fontSize: number
  fontFamily: string
  color: string
  align: string
  cacheKey: string
}): Promise<Texture> {
  const existing = cache.get(opts.cacheKey)
  if (existing) return existing

  const p = new Promise<Texture>((resolve, reject) => {
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(2, Math.ceil(opts.w * scale))
    canvas.height = Math.max(2, Math.ceil(opts.h * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('no 2d'))
      return
    }
    ctx.scale(scale, scale)
    ctx.clearRect(0, 0, opts.w, opts.h)

    const foreign = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${opts.w}" height="${opts.h}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="
            width:${opts.w}px;height:${opts.h}px;overflow:hidden;
            font-family:'${opts.fontFamily}',system-ui,sans-serif;
            font-size:${opts.fontSize}px;line-height:1.35;color:${opts.color};
            text-align:${opts.align};padding:4px 6px;box-sizing:border-box;
            word-wrap:break-word;white-space:pre-wrap;
          ">${opts.html || escapeXml(opts.plain) || '&nbsp;'}</div>
        </foreignObject>
      </svg>`
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(foreign)
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, opts.w, opts.h)
      resolve(Texture.from(canvas))
    }
    img.onerror = () => {
      // fallback: plain fillText
      ctx.fillStyle = opts.color
      ctx.font = `${opts.fontSize}px "${opts.fontFamily}", system-ui, sans-serif`
      ctx.textAlign = opts.align === 'center' ? 'center' : opts.align === 'right' ? 'right' : 'left'
      ctx.textBaseline = 'top'
      const x = opts.align === 'center' ? opts.w / 2 : opts.align === 'right' ? opts.w - 6 : 6
      wrapFillText(ctx, opts.plain || ' ', x, 4, opts.w - 12, opts.fontSize * 1.35)
      resolve(Texture.from(canvas))
    }
    img.src = url
  })
  cache.set(opts.cacheKey, p)
  // bound cache size
  if (cache.size > 80) {
    const first = cache.keys().next().value
    if (first) cache.delete(first)
  }
  return p
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>')
}

function wrapFillText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
): void {
  const words = text.split(/\s+/)
  let line = ''
  let yy = y
  for (const word of words) {
    const test = line ? line + ' ' + word : word
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy)
      line = word
      yy += lineH
    } else line = test
  }
  if (line) ctx.fillText(line, x, yy)
}
