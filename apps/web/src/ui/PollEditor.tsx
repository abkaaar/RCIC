/**
 * PollEditor — edit question/options and cast a vote (ISS-045).
 * Votes commit immediately and merge per-user so peers do not clobber each other.
 */
import { useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import type { CanvasObject } from '@rcic/shared'
import type { Camera } from '../canvas/CanvasApp'
import { Minus, Plus, X } from 'lucide-react'
import { clampOverlayRect } from './viewportClamp'

type Opt = { id: string; label: string }
type VoteMap = Record<string, Record<string, true>>

function cloneOptions(raw: unknown): Opt[] {
  if (!Array.isArray(raw)) return []
  return raw.map((o: { id?: string; label?: string }) => ({
    id: String(o.id ?? nanoid(6)),
    label: String(o.label ?? ''),
  }))
}

function cloneVotes(raw: unknown): VoteMap {
  if (!raw || typeof raw !== 'object') return {}
  const out: VoteMap = {}
  for (const [oid, map] of Object.entries(raw as VoteMap)) {
    if (map && typeof map === 'object') out[oid] = { ...map }
  }
  return out
}

/** Keep other users' votes; set or clear this user's choice. */
export function mergeUserVote(prev: VoteMap, userId: string, optionId: string | null): VoteMap {
  const next: VoteMap = {}
  for (const [oid, map] of Object.entries(prev)) {
    const cleaned = { ...map }
    delete cleaned[userId]
    if (Object.keys(cleaned).length) next[oid] = cleaned
  }
  if (optionId) {
    next[optionId] = { ...(next[optionId] ?? {}), [userId]: true }
  }
  return next
}

export function PollEditor(props: {
  obj: CanvasObject
  camera: Camera
  userId: string
  onCommit(data: Record<string, unknown>): void
  onClose(): void
}) {
  const { obj, camera } = props
  const [question, setQuestion] = useState(String(obj.data.question ?? ''))
  const [options, setOptions] = useState(() => cloneOptions(obj.data.options))
  const [votes, setVotes] = useState(() => cloneVotes(obj.data.votes))
  const debounceRef = useRef<number | null>(null)

  // Pull remote votes into local state without wiping in-progress label edits.
  useEffect(() => {
    setVotes(cloneVotes(obj.data.votes))
  }, [obj.id, obj.data.votes])

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [])

  const s = camera.scale
  const rawLeft = (obj.x - obj.w / 2 - camera.x) * s
  const rawTop = (obj.y - obj.h / 2 - camera.y) * s
  const width = Math.min(Math.max(240, obj.w * s), typeof window !== 'undefined' ? window.innerWidth - 16 : 800)
  const { left, top } = clampOverlayRect({ left: rawLeft, top: rawTop, width, height: 220 })

  const myOption = Object.entries(votes).find(([, m]) => m?.[props.userId])?.[0] ?? null

  const flushMeta = (nextQ: string, nextOpts: Opt[], nextVotes: VoteMap) => {
    props.onCommit({ question: nextQ, options: nextOpts, votes: nextVotes })
  }

  const scheduleMeta = (nextQ: string, nextOpts: Opt[]) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null
      flushMeta(nextQ, nextOpts, votes)
    }, 280)
  }

  const finish = () => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    flushMeta(question, options, votes)
    props.onClose()
  }

  /** One vote per user — commit immediately using latest remote votes as base. */
  const cast = (optionId: string) => {
    const base = cloneVotes(obj.data.votes)
    const choose = myOption === optionId ? null : optionId
    const next = mergeUserVote(base, props.userId, choose)
    setVotes(next)
    flushMeta(question, options, next)
  }

  const addOption = () => {
    if (options.length >= 8) return
    const next = [...options, { id: nanoid(6), label: `Option ${String.fromCharCode(65 + options.length)}` }]
    setOptions(next)
    flushMeta(question, next, votes)
  }

  const removeOption = (id: string) => {
    if (options.length <= 2) return
    const next = options.filter((o) => o.id !== id)
    const nextVotes = { ...votes }
    delete nextVotes[id]
    setOptions(next)
    setVotes(nextVotes)
    flushMeta(question, next, nextVotes)
  }

  return (
    <div
      className="table-editor-overlay poll-editor-overlay"
      style={{ left, top, width, minHeight: 180, maxHeight: 'min(420px, 70vh)' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="code-editor-bar">
        <strong style={{ flex: 1, fontSize: 13 }}>Poll</strong>
        <button type="button" className="table-bar-btn" title="Add option" onClick={addOption}>
          <Plus size={14} /> option
        </button>
        <button type="button" className="icon-btn" title="Done" onClick={finish}>
          <X size={14} />
        </button>
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        <input
          value={question}
          onChange={(e) => {
            const v = e.target.value
            setQuestion(v)
            scheduleMeta(v, options)
          }}
          placeholder="Question"
          style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0', font: 'inherit' }}
          onKeyDown={(e) => e.stopPropagation()}
        />
        {options.map((opt, i) => {
          const count = Object.keys(votes[opt.id] ?? {}).length
          return (
            <div key={opt.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                type="button"
                className={`tool-btn ${myOption === opt.id ? 'tool-active' : ''}`}
                style={{ width: 'auto', padding: '0 10px' }}
                onClick={() => cast(opt.id)}
                title={myOption === opt.id ? 'Remove vote' : 'Vote'}
              >
                {myOption === opt.id ? 'Voted' : 'Vote'}
              </button>
              <input
                value={opt.label}
                onChange={(e) => {
                  const next = options.map((o, j) => (j === i ? { ...o, label: e.target.value } : o))
                  setOptions(next)
                  scheduleMeta(question, next)
                }}
                style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #e2e8f0', font: 'inherit' }}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <span style={{ fontSize: 12, color: '#64748b', minWidth: 18, textAlign: 'right' }}>{count}</span>
              <button
                type="button"
                className="icon-btn"
                title="Remove option"
                disabled={options.length <= 2}
                onClick={() => removeOption(opt.id)}
              >
                <Minus size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
