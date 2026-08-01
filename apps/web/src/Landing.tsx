/**
 * Landing — brand hero with floating motifs + feature fan (ISS-053).
 */
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
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
  { src: iconRooms, title: 'Real-time rooms', text: 'Invite anyone with a link.', tint: 0 },
  { src: iconPhysics, title: 'Physics play', text: 'Throw notes, attract or repel.', tint: 1 },
  { src: iconRadar, title: 'Mini-map radar', text: 'See every collaborator.', tint: 2 },
  { src: iconOffline, title: 'Offline-first', text: 'Edits merge when you return.', tint: 3 },
  { src: iconReplay, title: 'Time travel', text: 'Replay the whole session.', tint: 4 },
  { src: iconIdeas, title: 'Rich objects', text: 'Shapes, stickies, voice notes.', tint: 5 },
]

const BG_MOTIFS = [
  { src: iconRadar, className: 'landing-motif m1' },
  { src: iconPhysics, className: 'landing-motif m2' },
  { src: iconReplay, className: 'landing-motif m3' },
  { src: iconOffline, className: 'landing-motif m4' },
  { src: iconIdeas, className: 'landing-motif m5' },
  { src: iconRooms, className: 'landing-motif m6' },
  { src: iconRadar, className: 'landing-motif m7' },
  { src: iconPhysics, className: 'landing-motif m8' },
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
      <div className="landing-bg" aria-hidden>
        {BG_MOTIFS.map((m, i) => (
          <img key={i} src={m.src} alt="" className={m.className} draggable={false} />
        ))}
      </div>

      <div className="landing-hero">
        <div className="landing-brand">
          <div className="landing-logo" aria-hidden />
          <span className="landing-wordmark">RCIC</span>
        </div>

        <div className="landing-pill">Realtime · Offline · Physics</div>

        <h1>
          An infinite <span className="accent">canvas</span>
        </h1>
        <p className="landing-sub">
          Sketch, brainstorm, and play together in real time.
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

        <div className="landing-fan" aria-label="Features">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className={`landing-fan-card fan-tint-${f.tint}`}
              style={{ ['--i' as string]: i }}
            >
              <img src={f.src} alt="" className="landing-fan-art" draggable={false} />
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
