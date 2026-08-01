/**
 * ShapesModal — FigJam-style left panel: pinned connectors + accordion categories (ISS-012/037).
 */
import { useMemo, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import type { ShapeKind } from '@rcic/shared'
import { isConnectorShapeKind } from '@rcic/shared'
import { filterShapes, SHAPE_CATEGORIES, type ShapeCategory } from '../shapes/catalog'
import { ShapeIcon } from '../shapes/ShapeIcon'

const CONNECTOR_STRIP: { id: ShapeKind; label: string }[] = [
  { id: 'connectorElbow', label: 'Bent' },
  { id: 'connectorCurve', label: 'Curved' },
  { id: 'connectorArrow', label: 'Arrow' },
  { id: 'connectorLine', label: 'Line' },
]

export function ShapesModal(props: {
  selectedKind: ShapeKind
  onPick(kind: ShapeKind): void
  onClose(): void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Record<ShapeCategory, boolean>>({
    basic: true,
    connectors: true,
    flowchart: false,
    advanced: false,
  })

  const filtered = useMemo(() => filterShapes(query), [query])
  const searching = query.trim().length > 0
  const connectorSelected = isConnectorShapeKind(props.selectedKind)

  const toggle = (id: ShapeCategory) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }))

  return (
    <div className="shapes-modal floating-panel" role="dialog" aria-label="Shapes">
      <div className="shapes-modal-header">
        <h2>Shapes</h2>
        <button type="button" className="icon-btn" title="Close" onClick={props.onClose}>
          <X size={16} />
        </button>
      </div>

      <label className="shapes-search">
        <Search size={15} aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search shapes"
          autoFocus
        />
      </label>

      {!searching && (
        <div className="shapes-connector-strip">
          <div className="shapes-connector-row">
            {CONNECTOR_STRIP.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`shape-cell shape-cell-connector${props.selectedKind === c.id ? ' shape-cell-active' : ''}`}
                title={c.label}
                onClick={() => props.onPick(c.id)}
              >
                <ShapeIcon kind={c.id} />
              </button>
            ))}
          </div>
          <div className="shapes-connector-hint">
            {connectorSelected ? 'Drag between objects or on empty canvas' : 'Connectors — drag object to object or free on canvas'}
          </div>
        </div>
      )}

      <div className="shapes-modal-body">
        {searching ? (
          <div className="shapes-grid">
            {filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`shape-cell${props.selectedKind === s.id ? ' shape-cell-active' : ''}`}
                title={s.label}
                onClick={() => props.onPick(s.id)}
              >
                <ShapeIcon kind={s.id} />
              </button>
            ))}
            {filtered.length === 0 && <div className="shapes-empty">No shapes match</div>}
          </div>
        ) : (
          SHAPE_CATEGORIES.filter((cat) => cat.id !== 'connectors').map((cat) => {
            const items = filtered.filter((s) => s.category === cat.id)
            const expanded = open[cat.id]
            return (
              <div key={cat.id} className="shapes-section">
                <button type="button" className="shapes-section-toggle" onClick={() => toggle(cat.id)}>
                  <span>{cat.label}</span>
                  <ChevronDown size={16} className={expanded ? 'chev-open' : ''} />
                </button>
                {expanded && (
                  <div className="shapes-grid">
                    {items.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`shape-cell${props.selectedKind === s.id ? ' shape-cell-active' : ''}`}
                        title={s.label}
                        onClick={() => props.onPick(s.id)}
                      >
                        <ShapeIcon kind={s.id} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
