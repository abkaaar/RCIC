/**
 * textHtml — sanitize / strip rich HTML for text & sticky objects (ISS-018).
 */
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'S', 'STRIKE', 'A', 'UL', 'OL', 'LI', 'BR', 'DIV', 'SPAN', 'P'])

export function sanitizeHtml(raw: string): string {
  if (typeof document === 'undefined') return raw
  const wrap = document.createElement('div')
  wrap.innerHTML = raw
  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      if (!ALLOWED.has(el.tagName)) {
        const parent = el.parentNode
        while (el.firstChild) parent?.insertBefore(el.firstChild, el)
        parent?.removeChild(el)
        return
      }
      for (const attr of [...el.attributes]) {
        if (el.tagName === 'A' && attr.name === 'href') {
          const href = attr.value.trim()
          if (!/^(https?:|mailto:)/i.test(href)) el.removeAttribute(attr.name)
          else el.setAttribute('target', '_blank')
          el.setAttribute('rel', 'noopener noreferrer')
        } else if (attr.name === 'style' || attr.name === 'class') {
          // keep style for color/font if present — strip event handlers only
          if (/expression|javascript:/i.test(attr.value)) el.removeAttribute(attr.name)
        } else if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name)
        } else if (!(el.tagName === 'A' && attr.name === 'href') && attr.name !== 'style') {
          el.removeAttribute(attr.name)
        }
      }
    }
    for (const child of [...node.childNodes]) walk(child)
  }
  walk(wrap)
  return wrap.innerHTML
}

export function htmlToPlain(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, '')
  const d = document.createElement('div')
  d.innerHTML = html
  return (d.innerText || d.textContent || '').trim()
}
