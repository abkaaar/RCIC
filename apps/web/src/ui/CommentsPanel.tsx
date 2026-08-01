/**
 * CommentsPanel — right dock listing board comments with reply threads (ISS-019/031).
 */
import { useMemo, useState } from 'react'
import { Check, MessageCircle, Pencil, Search, X } from 'lucide-react'
import type { CanvasObject, CommentReply, PeerUser } from '@rcic/shared'

function replyList(c: CanvasObject): CommentReply[] {
  return Array.isArray(c.data.replies) ? (c.data.replies as CommentReply[]) : []
}

export function CommentsPanel(props: {
  comments: CanvasObject[]
  activeId: string | null
  self: PeerUser
  onSelect(id: string): void
  onEdit(id: string): void
  onReply(id: string, text: string): void
  onResolve(id: string): void
  onClose(): void
}) {
  const [q, setQ] = useState('')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = props.comments.filter((c) => !c.data.resolved)
    if (!needle) return list
    return list.filter((c) => {
      const replies = replyList(c)
        .map((r) => `${r.author} ${r.text}`)
        .join(' ')
      const hay = `${c.data.author ?? ''} ${c.data.text ?? ''} ${replies}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [props.comments, q])

  return (
    <div className="floating-panel comments-panel" role="dialog" aria-label="Comments">
      <div className="comments-panel-header">
        <label className="comments-search">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
        </label>
        <button type="button" className="icon-btn" title="Close" onClick={props.onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="comments-panel-body">
        {filtered.length === 0 ? (
          <div className="comments-empty">
            <MessageCircle size={36} />
            <div>
              Give feedback, ask a question, or just leave a note of appreciation. Click anywhere on the board to leave
              a comment.
            </div>
          </div>
        ) : (
          filtered.map((c) => {
            const replies = replyList(c)
            const isAuthor = String(c.data.author ?? '') === props.self.name
            const draft = replyDrafts[c.id] ?? ''
            return (
              <div
                key={c.id}
                className={`comment-thread${props.activeId === c.id ? ' comment-thread-active' : ''}`}
                onClick={() => props.onSelect(c.id)}
              >
                <div className="comment-thread-top">
                  <div className="comment-thread-author" style={{ color: String(c.data.authorColor ?? c.color) }}>
                    {String(c.data.author || 'Someone')}
                  </div>
                  <div className="comment-thread-actions" onClick={(e) => e.stopPropagation()}>
                    {isAuthor && (
                      <button type="button" className="icon-btn" title="Edit" onClick={() => props.onEdit(c.id)}>
                        <Pencil size={13} />
                      </button>
                    )}
                    <button type="button" className="icon-btn" title="Resolve" onClick={() => props.onResolve(c.id)}>
                      <Check size={13} />
                    </button>
                  </div>
                </div>
                <div className="comment-thread-text">{String(c.data.text || '')}</div>
                {replies.length > 0 && (
                  <div className="comment-replies">
                    {replies.map((r) => (
                      <div key={r.id} className="comment-reply">
                        <div className="comment-thread-author" style={{ color: r.authorColor }}>
                          {r.author}
                        </div>
                        <div className="comment-thread-text">{r.text}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="comment-reply-compose" onClick={(e) => e.stopPropagation()}>
                  <input
                    value={draft}
                    placeholder="Reply…"
                    onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter' && draft.trim()) {
                        props.onReply(c.id, draft.trim())
                        setReplyDrafts((prev) => ({ ...prev, [c.id]: '' }))
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="comment-reply-btn"
                    disabled={!draft.trim()}
                    onClick={() => {
                      if (!draft.trim()) return
                      props.onReply(c.id, draft.trim())
                      setReplyDrafts((prev) => ({ ...prev, [c.id]: '' }))
                    }}
                  >
                    Reply
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
