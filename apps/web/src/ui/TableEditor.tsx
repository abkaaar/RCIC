/**
 * TableEditor — spreadsheet overlay for table objects (ISS-046).
 * Cell edits and row/col changes commit live so the canvas stays in sync.
 */
import { useEffect, useRef, useState } from 'react'
import type { CanvasObject } from '@rcic/shared'
import type { Camera } from '../canvas/CanvasApp'
import { Plus, Minus, X } from 'lucide-react'
import { clampOverlayRect } from './viewportClamp'

const MAX_ROWS = 20
const MAX_COLS = 12
const CELL_W = 72
const CELL_H = 36

function cloneCells(cells: string[][], rows: number, cols: number): string[][] {
  const out: string[][] = []
  for (let r = 0; r < rows; r++) {
    const row: string[] = []
    for (let c = 0; c < cols; c++) row.push(String(cells[r]?.[c] ?? ''))
    out.push(row)
  }
  return out
}

export function TableEditor(props: {
  obj: CanvasObject
  camera: Camera
  onCommit(patch: { cols: number; rows: number; cells: string[][]; w?: number; h?: number }): void
  onClose(): void
}) {
  const { obj, camera } = props
  const [cols, setCols] = useState(Math.max(1, Number(obj.data.cols ?? 3)))
  const [rows, setRows] = useState(Math.max(1, Number(obj.data.rows ?? 3)))
  const [cells, setCells] = useState(() =>
    cloneCells(obj.data.cells ?? [], Math.max(1, Number(obj.data.rows ?? 3)), Math.max(1, Number(obj.data.cols ?? 3))),
  )
  const [focus, setFocus] = useState({ r: 0, c: 0 })
  const debounceRef = useRef<number | null>(null)
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  const s = camera.scale
  const rawLeft = (obj.x - obj.w / 2 - camera.x) * s
  const rawTop = (obj.y - obj.h / 2 - camera.y) * s
  const width = Math.min(
    Math.max(220, Math.max(obj.w * s, cols * 56 + 16)),
    typeof window !== 'undefined' ? window.innerWidth - 16 : 800,
  )
  const minHeight = Math.min(
    Math.max(140, Math.max(obj.h * s, rows * 32 + 48)),
    typeof window !== 'undefined' ? window.innerHeight - 16 : 600,
  )
  const { left, top } = clampOverlayRect({ left: rawLeft, top: rawTop, width, height: minHeight })

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [])

  // Focus the active cell when navigation changes (autoFocus only works on mount).
  useEffect(() => {
    const el = inputRefs.current.get(`${focus.r}-${focus.c}`)
    el?.focus()
    el?.select()
  }, [focus.r, focus.c, rows, cols])

  const sizeFor = (r: number, c: number) => ({
    w: Math.max(200, c * CELL_W + 24),
    h: Math.max(120, r * CELL_H + 28),
  })

  const flush = (nextRows: number, nextCols: number, nextCells: string[][]) => {
    const sized = sizeFor(nextRows, nextCols)
    props.onCommit({
      cols: nextCols,
      rows: nextRows,
      cells: cloneCells(nextCells, nextRows, nextCols),
      w: sized.w,
      h: sized.h,
    })
  }

  const scheduleFlush = (nextRows: number, nextCols: number, nextCells: string[][]) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null
      flush(nextRows, nextCols, nextCells)
    }, 250)
  }

  const finish = () => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    flush(rows, cols, cells)
    props.onClose()
  }

  const setCell = (r: number, c: number, v: string) => {
    setCells((prev) => {
      const next = cloneCells(prev, rows, cols)
      next[r]![c] = v
      scheduleFlush(rows, cols, next)
      return next
    })
  }

  const changeRows = (delta: number) => {
    const nextRows = Math.max(1, Math.min(MAX_ROWS, rows + delta))
    if (nextRows === rows) return
    const next = cloneCells(cells, nextRows, cols)
    setRows(nextRows)
    setCells(next)
    setFocus((f) => ({ r: Math.min(f.r, nextRows - 1), c: f.c }))
    flush(nextRows, cols, next)
  }

  const changeCols = (delta: number) => {
    const nextCols = Math.max(1, Math.min(MAX_COLS, cols + delta))
    if (nextCols === cols) return
    const next = cloneCells(cells, rows, nextCols)
    setCols(nextCols)
    setCells(next)
    setFocus((f) => ({ r: f.r, c: Math.min(f.c, nextCols - 1) }))
    flush(rows, nextCols, next)
  }

  return (
    <div
      className="table-editor-overlay"
      style={{ left, top, width, minHeight, maxHeight: 'min(480px, 75vh)' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="code-editor-bar table-editor-bar">
        <button type="button" className="table-bar-btn" title="Add row" onClick={() => changeRows(1)}>
          <Plus size={14} /> row
        </button>
        <button type="button" className="table-bar-btn" title="Remove row" onClick={() => changeRows(-1)}>
          <Minus size={14} />
        </button>
        <button type="button" className="table-bar-btn" title="Add column" onClick={() => changeCols(1)}>
          <Plus size={14} /> col
        </button>
        <button type="button" className="table-bar-btn" title="Remove column" onClick={() => changeCols(-1)}>
          <Minus size={14} />
        </button>
        <button type="button" className="table-bar-btn" title="Done" onClick={finish}>
          <X size={14} />
        </button>
      </div>
      <div
        className="table-editor-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(48px, 1fr))`, overflow: 'auto' }}
      >
        {Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: cols }).map((__, c) => (
            <input
              key={`${r}-${c}`}
              ref={(el) => {
                const k = `${r}-${c}`
                if (el) inputRefs.current.set(k, el)
                else inputRefs.current.delete(k)
              }}
              value={cells[r]?.[c] ?? ''}
              onChange={(e) => setCell(r, c, e.target.value)}
              onFocus={() => setFocus({ r, c })}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Escape') {
                  e.preventDefault()
                  finish()
                  return
                }
                if (e.key === 'Enter' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  setFocus({ r: Math.min(rows - 1, r + 1), c })
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setFocus({ r: Math.max(0, r - 1), c })
                } else if (e.key === 'Tab') {
                  e.preventDefault()
                  const nc = c + (e.shiftKey ? -1 : 1)
                  if (nc >= cols) setFocus({ r: Math.min(rows - 1, r + 1), c: 0 })
                  else if (nc < 0) setFocus({ r: Math.max(0, r - 1), c: cols - 1 })
                  else setFocus({ r, c: nc })
                } else if (
                  e.key === 'ArrowRight' &&
                  (e.target as HTMLInputElement).selectionStart === (e.target as HTMLInputElement).value.length
                ) {
                  setFocus({ r, c: Math.min(cols - 1, c + 1) })
                } else if (e.key === 'ArrowLeft' && (e.target as HTMLInputElement).selectionStart === 0) {
                  setFocus({ r, c: Math.max(0, c - 1) })
                }
              }}
            />
          )),
        )}
      </div>
    </div>
  )
}
