/** ZoomControls — percent readout + zoom menu (includes Zoom to fit). */
import { useEffect, useRef, useState } from 'react'
import { HelpCircle, Minus, Plus } from 'lucide-react'

export function ZoomControls(props: {
  scale: number
  onZoomIn(): void
  onZoomOut(): void
  onZoomReset(): void
  onZoomFit(): void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setHelpOpen(false)
      }
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])

  return (
    <div className="zoom-cluster" ref={ref}>
      {helpOpen && (
        <div className="floating-panel help-sheet">
          <div className="share-title">Shortcuts</div>
          <div className="help-row"><b>V</b> select · <b>H</b> pan</div>
          <div className="help-row"><b>Scroll</b> pan · <b>Ctrl+scroll</b> zoom</div>
          <div className="help-row"><b>Drag + release fast</b> throw object</div>
          <div className="help-row"><b>Double-click</b> edit text</div>
          <div className="help-row"><b>Delete</b> remove selection</div>
        </div>
      )}
      <div className="floating-panel zoom-pill">
        <button className="icon-btn" title="Zoom out" onClick={props.onZoomOut}>
          <Minus size={15} />
        </button>
        <div className="menu-anchor">
          <button className="zoom-pct" onClick={() => setMenuOpen(!menuOpen)}>
            {Math.round(props.scale * 100)}%
          </button>
          {menuOpen && (
            <div className="floating-panel dropdown dropdown-up">
              <button
                className="dropdown-item"
                onClick={() => {
                  props.onZoomReset()
                  setMenuOpen(false)
                }}
              >
                Zoom to 100%
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  props.onZoomFit()
                  setMenuOpen(false)
                }}
              >
                Zoom to fit
              </button>
            </div>
          )}
        </div>
        <button className="icon-btn" title="Zoom in" onClick={props.onZoomIn}>
          <Plus size={15} />
        </button>
      </div>
      <button className="floating-panel help-btn" title="Shortcuts" onClick={() => setHelpOpen(!helpOpen)}>
        <HelpCircle size={16} />
      </button>
    </div>
  )
}
