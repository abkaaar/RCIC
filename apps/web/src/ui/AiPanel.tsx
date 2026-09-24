/**
 * AiPanel — Phase 2 UI shell for CanvasOps-backed board structuring.
 * No LLM calls yet: shows the approve-before-write design and roadmap actions.
 */
import { CheckCircle2, Layers, ListTodo, Sparkles, X } from 'lucide-react'

export function AiPanel(props: { onClose(): void }) {
  return (
    <aside className="floating-panel ai-panel" role="dialog" aria-label="RC-board AI">
      <div className="ai-panel-header">
        <div className="ai-panel-title">
          <Sparkles size={16} />
          <span>AI assist</span>
        </div>
        <button type="button" className="icon-btn" title="Close" aria-label="Close" onClick={props.onClose}>
          <X size={16} />
        </button>
      </div>

      <p className="ai-panel-lead">
        Structure messy brainstorms with CanvasOps: snapshot → dedupe → cluster → extract actions →{' '}
        <strong>you approve</strong> before the board changes.
      </p>

      <div className="ai-action-list">
        <button type="button" className="ai-action" disabled title="Coming in Phase 2">
          <Layers size={16} />
          <span>
            <strong>Cluster themes</strong>
            <em>Group stickies into titled sections</em>
          </span>
        </button>
        <button type="button" className="ai-action" disabled title="Coming in Phase 2">
          <CheckCircle2 size={16} />
          <span>
            <strong>Dedupe near-copies</strong>
            <em>Archive string near-duplicates (sandbox first)</em>
          </span>
        </button>
        <button type="button" className="ai-action" disabled title="Coming in Phase 2">
          <ListTodo size={16} />
          <span>
            <strong>Extract actions</strong>
            <em>Build a handoff pack for engineering</em>
          </span>
        </button>
      </div>

      <div className="ai-panel-foot">
        <span className="ai-badge">Preview</span>
        Live writes will require explicit approval. Semantic paraphrase merge and finance guardrails ship later.
      </div>
    </aside>
  )
}
