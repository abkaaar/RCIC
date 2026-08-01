/** ReplayBar — scrub controls for session timeline playback. */
import { FastForward, Pause, Play, X } from 'lucide-react'

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function ReplayBar(props: {
  t0: number
  t1: number
  t: number
  playing: boolean
  speed: number
  onSeek(t: number): void
  onTogglePlay(): void
  onSpeed(): void
  onClose(): void
}) {
  const dur = Math.max(1, props.t1 - props.t0)
  return (
    <div className="floating-panel replay-bar">
      <button className="icon-btn" title={props.playing ? 'Pause' : 'Play'} onClick={props.onTogglePlay}>
        {props.playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <button className="icon-btn speed-btn" title="Playback speed" onClick={props.onSpeed}>
        <FastForward size={14} />
        <span>{props.speed}x</span>
      </button>
      <span className="replay-time">{fmt(props.t - props.t0)}</span>
      <input
        type="range"
        min={0}
        max={dur}
        value={props.t - props.t0}
        onChange={(e) => props.onSeek(props.t0 + Number(e.target.value))}
      />
      <span className="replay-time">{fmt(dur)}</span>
      <button className="icon-btn" title="Back to live" onClick={props.onClose}>
        <X size={16} />
      </button>
    </div>
  )
}
