/**
 * RequireAuth — Google sign-in gate before opening a board room (create or invite join).
 */
import { useState } from 'react'
import { useAuth } from './AuthProvider'
import { navigate } from '../navigate'

export function RequireAuth(props: { children: React.ReactNode }) {
  const { user, loading, firestoreWarning, signInWithGoogle } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="auth-gate">
        <div className="floating-panel auth-gate-card">
          <div className="modal-logo-c" aria-hidden>
            C
          </div>
          <p>Loading account…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="auth-gate">
        <div className="floating-panel auth-gate-card">
          <div className="modal-logo-c" aria-hidden>
            C
          </div>
          <h2>Sign in with Google to join this board</h2>
          <p>
            Invite links require a Google account so collaborators stay linked to membership and board history. After
            sign-in you can pick your display name and cursor color.
          </p>
          {error && <p className="landing-error">{error}</p>}
          {firestoreWarning && <p className="landing-warn">{firestoreWarning}</p>}
          <button
            type="button"
            className="primary-btn"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              setError(null)
              void signInWithGoogle()
                .catch((err) => {
                  if (String(err).includes('Redirecting')) return
                  setError(err instanceof Error ? err.message : 'Sign-in failed')
                })
                .finally(() => setBusy(false))
            }}
          >
            {busy ? 'Signing in…' : 'Sign in with Google'}
          </button>
          <button type="button" className="auth-gate-back" onClick={() => navigate('/')}>
            Back to home
          </button>
        </div>
      </div>
    )
  }

  return <>{props.children}</>
}
