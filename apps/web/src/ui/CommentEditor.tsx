/**
 * CommentEditor — pin + pill input for placing/editing a comment (ISS-019/021/031).
 */
import { useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import type { CanvasObject } from '@rcic/shared'
import type { Camera } from '../canvas/CanvasApp'
import { clampOverlayRect } from './viewportClamp'

export function CommentEditor(props: {
  obj: CanvasObject
  camera: Camera
  /** When editing an existing root comment. */
  mode?: 'create' | 'edit'
  onSubmit(text: string): void
  onClose(): void
}) {
  const { obj, camera } = props
  const [text, setText] = useState(String(obj.data.text ?? ''))
  const ref = useRef<HTMLInputElement>(null)
  const s = camera.scale
  const rawLeft = (obj.x - camera.x) * s - 14
  const rawTop = (obj.y - camera.y) * s - 18
  const pillW = Math.min(360, typeof window !== 'undefined' ? window.innerWidth - 16 : 360)
  const { left, top } = clampOverlayRect({ left: rawLeft, top: rawTop, width: pillW + 36, height: 44 })

  useEffect(() => {
    setText(String(obj.data.text ?? ''))
  }, [obj.id, obj.data.text])

  useEffect(() => {
    ref.current?.focus()
    if (props.mode === 'edit') ref.current?.select()
  }, [props.mode, obj.id])

  const submit = () => {
    const v = text.trim()
    if (!v) {
      props.onClose()
      return
    }
    props.onSubmit(v)
  }

  return (
    <div className="comment-editor" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <svg className="comment-pin-svg" width="28" height="34" viewBox="0 0 28 34" aria-hidden>
        <defs>
          <filter id="commentPinShadow" x="-20%" y="-10%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodOpacity="0.25" />
          </filter>
        </defs>
        <path
          filter="url(#commentPinShadow)"
          fill={obj.color}
          stroke="#fff"
          strokeWidth="1.5"
          d="M14 31 C14 31 5 20 5 12.5 A9 9 0 0 1 23 12.5 C23 20 14 31 14 31 Z"
        />
      </svg>
      <div className="comment-input-pill">
        <input
          ref={ref}
          value={text}
          placeholder={props.mode === 'edit' ? 'Edit comment' : 'Add a comment'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') props.onClose()
          }}
        />
        <button type="button" className="comment-submit" disabled={!text.trim()} onClick={submit} title="Post">
          <ArrowUp size={16} />
        </button>
      </div>
    </div>
  )
}
