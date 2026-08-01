/**
 * CodeEditor — overlay editor for code snippet objects (ISS-043).
 */
import { useEffect, useRef, useState } from 'react'
import { CODE_LANGUAGES, type CanvasObject, type CodeLanguage } from '@rcic/shared'
import type { Camera } from '../canvas/CanvasApp'
import { Check, Copy, X } from 'lucide-react'
import { clampOverlayRect } from './viewportClamp'

export function CodeEditor(props: {
  obj: CanvasObject
  camera: Camera
  onCommit(patch: { language: CodeLanguage; source: string }): void
  onClose(): void
}) {
  const { obj, camera } = props
  const [language, setLanguage] = useState<CodeLanguage>((obj.data.language as CodeLanguage) || 'javascript')
  const [source, setSource] = useState(String(obj.data.source ?? ''))
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const s = camera.scale
  const rawLeft = (obj.x - obj.w / 2 - camera.x) * s
  const rawTop = (obj.y - obj.h / 2 - camera.y) * s
  const width = Math.min(Math.max(200, obj.w * s), typeof window !== 'undefined' ? window.innerWidth - 16 : 800)
  const height = Math.min(Math.max(140, obj.h * s), typeof window !== 'undefined' ? window.innerHeight - 16 : 600)
  const { left, top } = clampOverlayRect({ left: rawLeft, top: rawTop, width, height })

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const finish = () => {
    props.onCommit({ language, source })
    props.onClose()
  }

  return (
    <div
      className="code-editor-overlay"
      style={{ left, top, width, height }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="code-editor-bar">
        <select value={language} onChange={(e) => setLanguage(e.target.value as CodeLanguage)}>
          {CODE_LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="icon-btn"
          title="Copy code"
          onClick={() => {
            void navigator.clipboard.writeText(source)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button type="button" className="icon-btn" title="Done" onClick={finish}>
          <X size={14} />
        </button>
      </div>
      <textarea
        ref={ref}
        className="code-editor-area"
        value={source}
        spellCheck={false}
        onChange={(e) => setSource(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') finish()
        }}
      />
    </div>
  )
}
