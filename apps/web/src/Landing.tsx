/**
 * Landing — RC-board brand hero (full-bleed) + below-fold capabilities.
 * Brand-first: wordmark + C mark must dominate the first viewport.
 */
import { useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { createRoomId } from './api'
import { upsertBoardTab } from './boardTabs'
import { navigate } from './App'

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
  const [busy, setBusy] = useState(false)
  const [joinValue, setJoinValue] = useState('')

  const createRoom = async () => {
    setBusy(true)
    const roomId = await createRoomId()
    upsertBoardTab(roomId)
    props.onBoardCreated?.(roomId)
    navigate(`/r/${roomId}`)
  }

  const join = () => {
    const m = joinValue.match(/\/r\/([A-Za-z0-9_-]+)/) ?? joinValue.match(/^([A-Za-z0-9_-]{6,})$/)
    if (m) {
      upsertBoardTab(m[1])
      props.onBoardCreated?.(m[1])
      navigate(`/r/${m[1]}`)
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

        <div className="landing-actions">
          <button className="primary-btn landing-cta" disabled={busy} onClick={() => void createRoom()}>
            {busy ? 'Creating…' : 'Create a board'}
          </button>
          <div className="landing-join">
            <input
              placeholder="Paste an invite link or board code"
              value={joinValue}
              onChange={(e) => setJoinValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && join()}
              aria-label="Join board"
            />
            <button type="button" className="landing-join-btn" onClick={join} title="Join" aria-label="Join board">
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
        <p className="landing-cap-sub">No install. Share a link. Collaborate live — then run AI assist when the session ends.</p>
        <button className="primary-btn landing-cta landing-cta-inline" disabled={busy} onClick={() => void createRoom()}>
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
