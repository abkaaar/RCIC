/**
 * UserAccountMenu — Google avatar trigger with account details + sign out.
 */
import { useEffect, useRef, useState } from 'react'
import { LogOut } from 'lucide-react'
import type { User } from 'firebase/auth'

function initialsFrom(user: User): string {
  const base = user.displayName || user.email || '?'
  return base
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function UserAccountMenu(props: {
  user: User
  onSignOut(): void
  /** Prefer dark styling on the landing hero nav. */
  tone?: 'light' | 'dark'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { user, onSignOut, tone = 'light' } = props

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`user-account-menu user-account-menu-${tone}`} ref={ref}>
      <button
        type="button"
        className="user-account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.displayName || user.email || 'Account'}
        onClick={() => setOpen((v) => !v)}
      >
        {user.photoURL ? (
          <img className="user-account-avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="user-account-avatar user-account-avatar-fallback">{initialsFrom(user)}</span>
        )}
      </button>
      {open && (
        <div className="floating-panel dropdown user-account-dropdown" role="menu">
          <div className="user-account-details">
            {user.photoURL ? (
              <img className="user-account-avatar-lg" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="user-account-avatar-lg user-account-avatar-fallback">{initialsFrom(user)}</span>
            )}
            <div className="user-account-text">
              <div className="user-account-name">{user.displayName || 'Signed in'}</div>
              {user.email && <div className="user-account-email">{user.email}</div>}
            </div>
          </div>
          <div className="dropdown-divider" />
          <button
            type="button"
            className="dropdown-item logout-item"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
