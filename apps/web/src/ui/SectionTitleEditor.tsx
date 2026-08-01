/**
 * SectionTitleEditor — inline rename for section title pills (ISS-020).
 */
import { useEffect, useRef, useState } from 'react'
import type { CanvasObject } from '@rcic/shared'
import type { Camera } from '../canvas/CanvasApp'

export function SectionTitleEditor(props: {
  obj: CanvasObject
  camera: Camera
  onCommit(title: string): void
  onClose(): void
}) {
  const { obj, camera } = props
  const [title, setTitle] = useState(String(obj.data.title ?? 'Section'))
  const ref = useRef<HTMLInputElement>(null)
  const s = camera.scale
  const left = (obj.x - obj.w / 2 - camera.x) * s + 4
  const top = (obj.y - obj.h / 2 - camera.y) * s - 36

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const commit = () => {
    props.onCommit(title.trim() || 'Section')
  }

  return (
    <div className="section-title-editor" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <input
        ref={ref}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') props.onClose()
        }}
      />
    </div>
  )
}
