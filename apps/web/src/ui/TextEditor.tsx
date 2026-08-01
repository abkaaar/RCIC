/**
 * TextEditor — contentEditable overlay + dark FigJam-style format bar (ISS-018).
 */
import { useEffect, useRef, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  Link as LinkIcon,
  List,
  Strikethrough,
} from 'lucide-react'
import { TEXT_FONTS, TEXT_SIZE_PRESETS, type CanvasObject } from '@rcic/shared'
import type { Camera } from '../canvas/CanvasApp'
import { htmlToPlain, sanitizeHtml } from './textHtml'
import { clampOverlayRect } from './viewportClamp'

export interface TextCommitPayload {
  text: string
  html: string
  fontSize: number
  fontFamily: string
  align: 'left' | 'center' | 'right'
  height: number
}

export function TextEditor(props: {
  obj: CanvasObject
  camera: Camera
  onCommit(payload: TextCommitPayload): void
  onClose(): void
}) {
  const { obj, camera } = props
  const initialHtml =
    String(obj.data.html || '') ||
    (obj.data.text ? escapeText(String(obj.data.text)) : '')
  const [fontSize, setFontSize] = useState(Number(obj.data.fontSize ?? (obj.type === 'sticky' ? 20 : 28)))
  const [fontFamily, setFontFamily] = useState(String(obj.data.fontFamily ?? 'Inter'))
  const [align, setAlign] = useState<'left' | 'center' | 'right'>(
    (obj.data.align as 'left' | 'center' | 'right') || 'left',
  )
  const [fontOpen, setFontOpen] = useState(false)
  const [sizeOpen, setSizeOpen] = useState(false)
  const [sizeDraft, setSizeDraft] = useState(String(fontSize))
  const editRef = useRef<HTMLDivElement>(null)
  const throttleRef = useRef<number | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  // Floor for sticky notes — do not grow minHeight from live commits (ISS-038).
  const floorHRef = useRef(obj.type === 'sticky' ? obj.h : 56)
  const [fitH, setFitH] = useState(obj.h)
  const lastHRef = useRef(obj.h)

  const s = camera.scale
  const left = (obj.x - obj.w / 2 - camera.x) * s
  const top = (obj.y - obj.h / 2 - camera.y) * s
  const color = obj.type === 'sticky' ? '#27303f' : obj.color

  /** Measure content height without feeding committed h back into minHeight. */
  const measureHeight = (): number => {
    const el = editRef.current
    if (!el) return lastHRef.current
    const prevMin = el.style.minHeight
    const prevH = el.style.height
    el.style.minHeight = '0'
    el.style.height = 'auto'
    const contentPx = el.scrollHeight
    el.style.minHeight = prevMin
    el.style.height = prevH
    const next = Math.max(floorHRef.current, contentPx / s)
    return Math.round(next * 10) / 10
  }

  const snapshot = (height: number): TextCommitPayload => {
    const html = sanitizeHtml(editRef.current?.innerHTML ?? '')
    return {
      text: htmlToPlain(html),
      html,
      fontSize,
      fontFamily,
      align,
      height,
    }
  }

  // 300ms live-commit throttle: coalesces keystrokes so peers see progress without
  // a Yjs write (and UndoManager step) on every character.
  const push = () => {
    if (throttleRef.current) return
    throttleRef.current = window.setTimeout(() => {
      throttleRef.current = null
      const nextH = measureHeight()
      const height = Math.abs(nextH - lastHRef.current) < 1 ? lastHRef.current : nextH
      lastHRef.current = height
      setFitH(height)
      props.onCommit(snapshot(height))
    }, 300)
  }

  useEffect(() => {
    const el = editRef.current
    if (!el) return
    el.innerHTML = initialHtml || '<br>'
    el.focus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setFontOpen(false)
        setSizeOpen(false)
      }
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])

  const finish = () => {
    if (throttleRef.current) {
      clearTimeout(throttleRef.current)
      throttleRef.current = null
    }
    const nextH = measureHeight()
    lastHRef.current = nextH
    setFitH(nextH)
    props.onCommit(snapshot(nextH))
    props.onClose()
  }

  const run = (cmd: string, value?: string) => {
    editRef.current?.focus()
    document.execCommand(cmd, false, value)
    push()
  }

  const applyLink = () => {
    const url = window.prompt('Link URL', 'https://')
    if (!url) return
    run('createLink', url)
  }

  const presetMatch = TEXT_SIZE_PRESETS.find((p) => p.size === fontSize)

  const barWidth = Math.min(420, typeof window !== 'undefined' ? window.innerWidth - 16 : 420)
  const barPos = clampOverlayRect({
    left: Math.max(8, left),
    top: Math.max(8, top - 48),
    width: barWidth,
    height: 40,
  })

  return (
    <>
      <div
        ref={barRef}
        className="text-format-bar"
        style={{ left: barPos.left, top: barPos.top }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="tf-menu-anchor">
          <button
            type="button"
            className="tf-btn tf-dropdown"
            title="Font"
            onClick={() => {
              setFontOpen((v) => !v)
              setSizeOpen(false)
            }}
          >
            <span style={{ fontFamily }}>{fontFamily}</span>
            <ChevronDown size={14} />
          </button>
          {fontOpen && (
            <div className="tf-menu">
              {TEXT_FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="tf-menu-item"
                  style={{ fontFamily: f.id }}
                  onClick={() => {
                    setFontFamily(f.id)
                    setFontOpen(false)
                    push()
                  }}
                >
                  {fontFamily === f.id && <Check size={14} />}
                  <span>{f.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="tf-menu-anchor">
          <button
            type="button"
            className="tf-btn tf-dropdown"
            title="Size"
            onClick={() => {
              setSizeOpen((v) => !v)
              setFontOpen(false)
              setSizeDraft(String(fontSize))
            }}
          >
            {presetMatch?.label ?? fontSize}
            <ChevronDown size={14} />
          </button>
          {sizeOpen && (
            <div className="tf-menu tf-size-menu">
              {TEXT_SIZE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="tf-menu-item"
                  onClick={() => {
                    setFontSize(p.size)
                    setSizeDraft(String(p.size))
                    setSizeOpen(false)
                    push()
                  }}
                >
                  {fontSize === p.size && <Check size={14} />}
                  <span>{p.label}</span>
                </button>
              ))}
              <input
                className="tf-size-input"
                type="number"
                min={8}
                max={200}
                value={sizeDraft}
                onChange={(e) => setSizeDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const n = Math.max(8, Math.min(200, Number(sizeDraft) || fontSize))
                    setFontSize(n)
                    setSizeDraft(String(n))
                    setSizeOpen(false)
                    push()
                  }
                }}
                onBlur={() => {
                  const n = Math.max(8, Math.min(200, Number(sizeDraft) || fontSize))
                  setFontSize(n)
                  setSizeDraft(String(n))
                  push()
                }}
              />
            </div>
          )}
        </div>

        <button type="button" className="tf-btn" title="Bold" onClick={() => run('bold')}>
          <Bold size={15} />
        </button>
        <button type="button" className="tf-btn" title="Strikethrough" onClick={() => run('strikeThrough')}>
          <Strikethrough size={15} />
        </button>
        <button type="button" className="tf-btn" title="Link" onClick={applyLink}>
          <LinkIcon size={15} />
        </button>
        <button type="button" className="tf-btn" title="Bulleted list" onClick={() => run('insertUnorderedList')}>
          <List size={15} />
        </button>
        <button
          type="button"
          className={`tf-btn ${align === 'left' ? 'tf-active' : ''}`}
          title="Align left"
          onClick={() => {
            setAlign('left')
            run('justifyLeft')
          }}
        >
          <AlignLeft size={15} />
        </button>
        <button
          type="button"
          className={`tf-btn ${align === 'center' ? 'tf-active' : ''}`}
          title="Align center"
          onClick={() => {
            setAlign('center')
            run('justifyCenter')
          }}
        >
          <AlignCenter size={15} />
        </button>
        <button
          type="button"
          className={`tf-btn ${align === 'right' ? 'tf-active' : ''}`}
          title="Align right"
          onClick={() => {
            setAlign('right')
            run('justifyRight')
          }}
        >
          <AlignRight size={15} />
        </button>
      </div>

      <div
        ref={editRef}
        className={`text-editor text-editor-rich ${obj.type === 'sticky' ? 'text-editor-sticky' : ''}`}
        contentEditable
        suppressContentEditableWarning
        style={{
          left,
          top,
          width: obj.w * s,
          minHeight: Math.max(floorHRef.current, fitH) * s,
          fontSize: fontSize * s,
          fontFamily: `"${fontFamily}", system-ui, sans-serif`,
          color,
          textAlign: align,
        }}
        onInput={() => push()}
        onBlur={(e) => {
          if (barRef.current?.contains(e.relatedTarget as Node)) return
          finish()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') finish()
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) finish()
          e.stopPropagation()
        }}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </>
  )
}

function escapeText(t: string): string {
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}
