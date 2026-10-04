/**
 * Landing — RC-board brand hero (full-bleed) + below-fold capabilities.
 * Brand-first: wordmark + C mark must dominate the first viewport.
 */
import { useEffect, useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { checkServerHealth, createRoomId } from './api'
import { useAuth } from './auth/AuthProvider'
import { upsertBoardTab } from './boardTabs'
import { createBoardMeta, subscribeMyBoards, type BoardMeta } from './firebase/boards'
import { navigate } from './navigate'
import { UserAccountMenu } from './ui/UserAccountMenu'

import iconRooms from './assets/landing/icon-rooms.png'
import iconPhysics from './assets/landing/icon-physics.png'
import iconRadar from './assets/landing/icon-radar.png'
import iconOffline from './assets/landing/icon-offline.png'
import iconReplay from './assets/landing/icon-replay.png'
import iconIdeas from './assets/landing/icon-ideas.png'

const FEATURES = [
  { src: iconRooms, title: 'Live rooms', text: 'Invite teammates with a link and work on one infinite board.' },
  { src: iconIdeas, title: 'AI structuring', text: 'Cluster themes, dedupe near-copies, and extract action items with approval.' },
  { src: iconReplay, title: 'Session replay', text: 'Time-travel the board — useful for reviews and audit-friendly recap.' },
  { src: iconOffline, title: 'Offline-first', text: 'Keep editing; changes merge when you reconnect.' },
  { src: iconRadar, title: 'Presence radar', text: 'See collaborators on the mini-map as you navigate the canvas.' },
  { src: iconPhysics, title: 'Physics play', text: 'Throw notes, pull, or push — optional energy for workshops.' },
]

export function Landing(props: { onBoardCreated?(roomId: string): void }) {
  const { user, loading, firestoreWarning, clearFirestoreWarning, signInWithGoogle, signOut, requireAuth } =
    useAuth()
  const [busy, setBusy] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [joinValue, setJoinValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [warn, setWarn] = useState<string | null>(null)
  const [serverOk, setServerOk] = useState<boolean | null>(null)
  const [myBoards, setMyBoards] = useState<BoardMeta[]>([])

  useEffect(() => {
    let cancelled = false
    const probe = () => {
      void checkServerHealth().then((ok) => {
        if (!cancelled) setServerOk(ok)
      })
    }
    probe()
    const t = window.setInterval(probe, 15000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [])

  // Realtime Firestore list of boards this Google account belongs to.
  useEffect(() => {
    if (!user) {
      setMyBoards([])
      return
    }
    return subscribeMyBoards(
      user.uid,
      (boards) => setMyBoards(boards),
      (msg) => setWarn(msg),
    )
  }, [user])

  const createRoom = async () => {
    setBusy(true)
    setError(null)
    setWarn(null)
    clearFirestoreWarning()
    try {
      await requireAuth()
      const roomId = await createRoomId({ requireServer: true })
      try {
        await createBoardMeta(roomId)
      } catch (metaErr) {
        console.warn(metaErr)
        setWarn(
          metaErr instanceof Error
            ? `${metaErr.message} Board will still open; membership sync may retry later.`
            : 'Board metadata could not be saved; board will still open.',
        )
      }
      upsertBoardTab(roomId)
      props.onBoardCreated?.(roomId)
      navigate(`/r/${roomId}`)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Could not create board')
      setBusy(false)
    }
  }

  const join = async () => {
    const m = joinValue.match(/\/r\/([A-Za-z0-9_-]+)/) ?? joinValue.match(/^([A-Za-z0-9_-]{6,})$/)
    if (!m) return
    setBusy(true)
    setError(null)
    setWarn(null)
    try {
      await requireAuth()
      upsertBoardTab(m[1])
      props.onBoardCreated?.(m[1])
      navigate(`/r/${m[1]}`)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Could not join board')
      setBusy(false)
    }
  }

  const onNavSignIn = async () => {
    setAuthBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      if (String(err).includes('Redirecting')) return
      console.error(err)
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setAuthBusy(false)
    }
  }

  return (
    <div className="landing">
      <div className="landing-atmosphere" aria-hidden>
        <div className="landing-grid" />
        <div className="landing-glow landing-glow-a" />
        <div className="landing-glow landing-glow-b" />
      </div>

      <header className="landing-nav">
        <a className="landing-nav-brand" href="#top" aria-label="RC-board home">
          <span className="landing-nav-logo" aria-hidden>
            C
          </span>
          <span className="landing-nav-wordmark">RC-board</span>
        </a>
        <nav className="landing-nav-links" aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#ai">AI</a>
          <a href="#product">Product</a>
        </nav>
        {loading ? (
          <span className="landing-nav-auth-status">…</span>
        ) : user ? (
          <UserAccountMenu user={user} tone="dark" onSignOut={() => void signOut()} />
        ) : (
          <button type="button" className="landing-nav-cta" disabled={authBusy} onClick={() => void onNavSignIn()}>
            {authBusy ? 'Signing in…' : 'Sign in with Google'}
          </button>
        )}
      </header>

      <section className="landing-hero" id="top">
        <div className="landing-brand">
          <div className="landing-logo" aria-hidden>
            <span className="landing-logo-c">C</span>
          </div>
          <span className="landing-wordmark">RC-board</span>
        </div>

        <p className="landing-ai-badge">
          <Sparkles size={14} strokeWidth={2.25} aria-hidden />
          AI-powered whiteboard
        </p>

        <h1>
          AI whiteboard where <span className="landing-h1-accent">ideas and teams</span> connect
        </h1>
        <p className="landing-sub">
          Sketch live with your team, then let AI cluster themes, dedupe near-copies, and extract actions — you approve before anything changes.
        </p>

        {serverOk === false && (
          <p className="landing-warn" role="status">
            Sync server is down. Start it with <code>npm run dev</code> or Docker before creating a board.
          </p>
        )}
        {(firestoreWarning || warn) && (
          <p className="landing-warn" role="status">
            {firestoreWarning || warn}
          </p>
        )}
        {error && <p className="landing-error">{error}</p>}

        <div className="landing-actions">
          <button
            className="primary-btn landing-cta"
            disabled={busy || serverOk === false}
            onClick={() => void createRoom()}
          >
            {busy ? 'Creating…' : user ? 'Create a board' : 'Sign in & create a board'}
          </button>
          <div className="landing-join">
            <input
              placeholder="Paste an invite link or board code"
              value={joinValue}
              onChange={(e) => setJoinValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void join()}
              aria-label="Join board"
            />
            <button type="button" className="landing-join-btn" onClick={() => void join()} title="Join" aria-label="Join board">
              <ArrowRight size={18} strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <div className="landing-stage" aria-hidden>
          <div className="landing-stage-board">
            <div className="landing-sticky s1">Risk review</div>
            <div className="landing-sticky s2">Ship ACL model</div>
            <div className="landing-sticky s3">Dark mode</div>
            <div className="landing-cursor c1" />
            <div className="landing-cursor c2" />
            <div className="landing-section-frame" />
            <div className="landing-ai-chip">
              <Sparkles size={12} aria-hidden />
              AI: 3 themes · 2 dupes
            </div>
          </div>
        </div>
      </section>

      {user && (
        <section className="landing-boards" id="boards" aria-labelledby="landing-boards-title">
          <h2 id="landing-boards-title" className="landing-cap-heading">
            Your boards
          </h2>
          <p className="landing-cap-sub">
            Live from Firestore — new boards and renames appear here as soon as they sync.
          </p>
          {myBoards.length === 0 ? (
            <p className="landing-boards-empty">No boards yet. Create one above to get started.</p>
          ) : (
            <ul className="landing-boards-list">
              {myBoards.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    className="landing-board-row"
                    onClick={() => {
                      upsertBoardTab(b.id, b.name)
                      props.onBoardCreated?.(b.id)
                      navigate(`/r/${b.id}`)
                    }}
                  >
                    <span className="landing-board-name">{b.name || 'Untitled board'}</span>
                    <span className="landing-board-meta">
                      {b.memberIds.length} member{b.memberIds.length === 1 ? '' : 's'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="landing-capabilities" id="features" aria-label="What you can do">
        <h2 className="landing-cap-heading">Built for teams that move fast</h2>
        <p className="landing-cap-sub">Realtime canvas plus AI structuring — with human approval on every consequential write.</p>
        <ul className="landing-cap-list">
          {FEATURES.map((f) => (
            <li key={f.title} className="landing-cap-item">
              <img src={f.src} alt="" className="landing-cap-icon" draggable={false} />
              <div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-ai-section" id="ai" aria-labelledby="landing-ai-title">
        <h2 id="landing-ai-title" className="landing-cap-heading">
          AI that structures the board — not another chat box
        </h2>
        <p className="landing-cap-sub">
          Snapshot → dedupe → cluster → extract actions → verify. You review and approve before the live board updates.
        </p>
        <ul className="landing-ai-points">
          <li>
            <strong>Cluster themes</strong>
            <span>Group stickies into titled sections after brainstorms.</span>
          </li>
          <li>
            <strong>Dedupe near-copies</strong>
            <span>Archive string near-duplicates in a sandbox first.</span>
          </li>
          <li>
            <strong>Extract actions</strong>
            <span>Build a handoff pack your team can ship from.</span>
          </li>
        </ul>
      </section>

      <section className="landing-product-cta" id="product">
        <h2 className="landing-cap-heading">Start on a blank board in seconds</h2>
        <p className="landing-cap-sub">Sign in with Google, share a link, collaborate live — then run AI assist when the session ends.</p>
        <button
          className="primary-btn landing-cta landing-cta-inline"
          disabled={busy || serverOk === false}
          onClick={() => void createRoom()}
        >
          {busy ? 'Creating…' : 'Create a free board'}
        </button>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <span className="landing-nav-logo" aria-hidden>
            C
          </span>
          <div>
            <strong>RC-board</strong>
            <p>AI-powered online whiteboard where ideas and teams connect.</p>
          </div>
        </div>
        <nav className="landing-footer-links" aria-label="Footer">
          <a href="#features">Features</a>
          <a href="#ai">AI</a>
          <a href="#product">Product</a>
          <a href="#top">Back to top</a>
        </nav>
        <p className="landing-footer-copy">© {new Date().getFullYear()} RC-board. Built for realtime teams.</p>
      </footer>
    </div>
  )
}
