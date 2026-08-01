/**
 * Toolbar — tool picker + create actions; Plus opens tabbed PlusModal (ISS-042).
 */
import { useEffect, useRef, useState } from 'react'
import {
  Hand,
  LayoutTemplate,
  MessageCircle,
  Mic,
  MousePointer2,
  Plus,
  Type,
} from 'lucide-react'
import type { Tool } from '../canvas/CanvasApp'
import { PlusModal } from './PlusModal'
import iconShapes from '../assets/icons/tool-flowchart.png'
import iconSticky from '../assets/icons/tool-sticky.png'
import iconMarker from '../assets/icons/tool-marker.png'
import iconImage from '../assets/icons/tool-image.png'

export type ToolbarTool = Tool | 'image' | 'audio'

function ToolIcon(props: { src: string; alt: string }) {
  return <img src={props.src} alt={props.alt} className="tool-icon-img" draggable={false} />
}

function ToolButton(props: {
  active?: boolean
  title: string
  danger?: boolean
  onClick(): void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={`tool-btn ${props.active ? 'tool-active' : ''} ${props.danger ? 'tool-danger' : ''}`}
      title={props.title}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

export function Toolbar(props: {
  tool: Tool
  shapesOpen?: boolean
  recording: boolean
  physicsOn: boolean
  isOwner: boolean
  votingActive: boolean
  onTool(tool: Tool): void
  onOpenShapes(): void
  onImage(): void
  onAudio(): void
  onTogglePhysics(): void
  onSticker(emoji: string): void
  onInsert(kind: 'code' | 'poll' | 'table' | 'chart'): void
  onTemplate(kind: 'brainstorm' | 'flowchart'): void
  onVotingStart(): void
  onVotingStop(): void
  onVotingReset(): void
  onReaction(emoji: string): void
}) {
  const [plusOpen, setPlusOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPlusOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])

  return (
    <div className="toolbar-wrap" ref={ref}>
      {plusOpen && (
        <PlusModal
          physicsOn={props.physicsOn}
          isOwner={props.isOwner}
          votingActive={props.votingActive}
          onPickSticker={(emoji) => {
            props.onSticker(emoji)
            setPlusOpen(false)
          }}
          onTogglePhysics={props.onTogglePhysics}
          onInsert={(kind) => {
            props.onInsert(kind)
            setPlusOpen(false)
          }}
          onTemplate={(kind) => {
            props.onTemplate(kind)
            setPlusOpen(false)
          }}
          onVotingStart={props.onVotingStart}
          onVotingStop={props.onVotingStop}
          onVotingReset={props.onVotingReset}
          onReaction={(emoji) => {
            props.onReaction(emoji)
          }}
          onClose={() => setPlusOpen(false)}
        />
      )}
      <div className="floating-panel toolbar">
        <ToolButton active={props.tool === 'select'} title="Select (V)" onClick={() => props.onTool('select')}>
          <MousePointer2 size={18} />
        </ToolButton>
        <ToolButton active={props.tool === 'hand'} title="Hand tool (H)" onClick={() => props.onTool('hand')}>
          <Hand size={18} />
        </ToolButton>

        <div className="toolbar-divider" />

        <ToolButton
          active={props.tool === 'shape' || props.tool === 'connect' || !!props.shapesOpen}
          title="Shapes"
          onClick={() => props.onOpenShapes()}
        >
          <ToolIcon src={iconShapes} alt="Shapes" />
        </ToolButton>

        <ToolButton active={props.tool === 'text'} title="Text — click canvas to place" onClick={() => props.onTool('text')}>
          <Type size={18} />
        </ToolButton>
        <ToolButton
          active={props.tool === 'sticky'}
          title="Sticky note — click canvas to place"
          onClick={() => props.onTool('sticky')}
        >
          <ToolIcon src={iconSticky} alt="Sticky note" />
        </ToolButton>
        <ToolButton
          active={props.tool === 'section'}
          title="Section (Shift+S) — click canvas to place"
          onClick={() => props.onTool('section')}
        >
          <LayoutTemplate size={18} />
        </ToolButton>
        <ToolButton active={props.tool === 'ink'} title="Marker" onClick={() => props.onTool('ink')}>
          <ToolIcon src={iconMarker} alt="Marker" />
        </ToolButton>

        <div className="toolbar-divider" />

        <ToolButton title="Upload image" onClick={props.onImage}>
          <ToolIcon src={iconImage} alt="Upload image" />
        </ToolButton>
        <ToolButton
          title={props.recording ? 'Stop recording' : 'Record audio'}
          danger={props.recording}
          onClick={props.onAudio}
        >
          <Mic size={18} className={props.recording ? 'pulse' : ''} />
        </ToolButton>
        <ToolButton
          active={props.tool === 'comment'}
          title="Comment — click canvas to place"
          onClick={() => props.onTool('comment')}
        >
          <MessageCircle size={18} />
        </ToolButton>

        <div className="toolbar-divider" />

        <ToolButton active={plusOpen} title="Stickers & more" onClick={() => setPlusOpen(!plusOpen)}>
          <Plus size={18} />
        </ToolButton>
      </div>
    </div>
  )
}
