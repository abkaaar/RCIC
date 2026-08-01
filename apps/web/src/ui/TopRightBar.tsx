/** TopRightBar — share, export, accent settings, replay, identity. */
import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Download, History, LogOut, Settings } from 'lucide-react'
import { USER_COLORS } from '@rcic/shared'
import { ACCENT_COLORS, getAccent, setAccent } from '../theme'
import type { Peer } from './types'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function Timer({ createdAt, onClick }: { createdAt: number | null; onClick(): void }) {
  const [, force] = useState(0)
  useEffect(() => {
    const i = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(i)
  }, [])
  const secs = createdAt ? Math.max(0, Math.floor((Date.now() - createdAt) / 1000)) : 0
  const mm = Math.floor(secs / 60)
  const ss = String(secs % 60).padStart(2, '0')
  return (
    <button className="timer-btn" title="Replay this session" onClick={onClick}>
      <History size={14} />
      <span>
        {mm}:{ss}
      </span>
    </button>
  )
}

type Menu = 'none' | 'share' | 'export' | 'settings' | 'identity'

export function TopRightBar(props: {
  self: { name: string; color: string }
  peers: Peer[]
  createdAt: number | null
  onReplay(): void
  onExport(format: 'png' | 'svg' | 'json'): void
  onLogout(): void
  onAccentChange?(color: string): void
  onCursorColor?(color: string): void
}) {
  const [menu, setMenu] = useState<Menu>('none')
  const [copied, setCopied] = useState(false)
  const [accent, setAccentState] = useState(getAccent)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu('none')
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])

  const toggle = (m: Menu) => setMenu((cur) => (cur === m ? 'none' : m))

  const peerAvatars = props.peers.slice(0, 3)
  const extra = Math.max(0, props.peers.length - peerAvatars.length)

  return (
    <div className="floating-panel top-right-bar" ref={ref}>
      <div className="menu-anchor">
        <button
          className="avatar avatar-self"
          style={{ background: props.self.color }}
          title={props.self.name}
          onClick={() => toggle('identity')}
        >
          {initials(props.self.name)}
        </button>
        {menu === 'identity' && (
          <div className="floating-panel dropdown identity-dropdown">
            <div className="identity-you">
              <div className="avatar" style={{ background: props.self.color }}>
                {initials(props.self.name)}
              </div>
              <div>
                <div className="identity-name">{props.self.name}</div>
                <div className="identity-role">You</div>
              </div>
            </div>
            {props.onCursorColor && (
              <>
                <div className="dropdown-divider" />
                <div className="identity-section-label">Cursor color</div>
                <div className="color-row accent-row">
                  {USER_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`color-dot ${props.self.color === c ? 'color-dot-active color-dot-accent' : ''}`}
                      style={{ background: c }}
                      title={c}
                      onClick={() => props.onCursorColor?.(c)}
                    />
                  ))}
                </div>
              </>
            )}
            {props.peers.length > 0 && (
              <>
                <div className="dropdown-divider" />
                <div className="identity-section-label">Collaborators</div>
                {props.peers.map((p) => (
                  <div key={p.id} className="identity-peer">
                    <span className="peer-dot" style={{ background: p.color }} />
                    <span>{p.name}</span>
                  </div>
                ))}
              </>
            )}
            <div className="dropdown-divider" />
            <button
              className="dropdown-item logout-item"
              onClick={() => {
                setMenu('none')
                props.onLogout()
              }}
            >
              <LogOut size={14} /> Log out
            </button>
          </div>
        )}
      </div>

      {peerAvatars.length > 0 && (
        <div className="avatar-stack" title={props.peers.map((a) => a.name).join(', ')}>
          {peerAvatars.map((a) => (
            <div key={a.id} className="avatar" style={{ background: a.color }}>
              {initials(a.name)}
            </div>
          ))}
          {extra > 0 && <div className="avatar avatar-extra">+{extra}</div>}
        </div>
      )}

      <Timer createdAt={props.createdAt} onClick={props.onReplay} />

      <div className="menu-anchor">
        <button className="icon-btn" title="Settings" onClick={() => toggle('settings')}>
          <Settings size={16} />
        </button>
        {menu === 'settings' && (
          <div className="floating-panel dropdown settings-popover">
            <div className="share-title">Accent color</div>
            <div className="color-row accent-row">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c}
                  className={`color-dot ${accent === c ? 'color-dot-active' : ''}`}
                  style={{ background: c }}
                  title={c}
                  onClick={() => {
                    setAccent(c)
                    setAccentState(c)
                    props.onAccentChange?.(c)
                  }}
                />
              ))}
            </div>
            <div className="share-hint">Applies to Share, selected tools, and outlines on this device.</div>
          </div>
        )}
      </div>

      <div className="menu-anchor">
        <button className="icon-btn" title="Export" onClick={() => toggle('export')}>
          <Download size={16} />
        </button>
        {menu === 'export' && (
          <div className="floating-panel dropdown">
            {(['png', 'svg', 'json'] as const).map((f) => (
              <button
                key={f}
                className="dropdown-item"
                onClick={() => {
                  setMenu('none')
                  props.onExport(f)
                }}
              >
                Export as {f.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="menu-anchor">
        <button className="share-btn" onClick={() => toggle('share')}>
          Share
        </button>
        {menu === 'share' && (
          <div className="floating-panel dropdown share-popover">
            <div className="share-title">Invite collaborators</div>
            <div className="share-row">
              <input readOnly value={location.href} onFocus={(e) => e.target.select()} />
              <button
                className="icon-btn"
                onClick={() => {
                  void navigator.clipboard.writeText(location.href)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
            <div className="share-hint">Anyone with the link joins this board instantly.</div>
          </div>
        )}
      </div>
    </div>
  )
}
