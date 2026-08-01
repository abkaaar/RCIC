export interface Peer {
  id: number
  name: string
  color: string
  cursor?: { x: number; y: number }
  viewport?: { x: number; y: number; w: number; h: number }
  selection?: string | null
}

export interface Toast {
  id: number
  text: string
  actionLabel?: string
  onAction?: () => void
}

export type ConnState = 'connecting' | 'live' | 'offline'
