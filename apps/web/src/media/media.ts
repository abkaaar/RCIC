/**
 * media — local image/audio ingest. Images are downscaled to data URLs so Yjs stays bounded.
 */
/** downscale an image file to a data URL sized for the canvas */
export async function processImageFile(file: File): Promise<{ src: string; w: number; h: number }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = reject
    r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = dataUrl
  })
  const MAX = 1600
  const scale = Math.min(1, MAX / Math.max(img.width, img.height))
  let src = dataUrl
  if (scale < 1 || file.size > 1_500_000) {
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * scale)
    c.height = Math.round(img.height * scale)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    src = c.toDataURL('image/jpeg', 0.9)
  }
  const DISPLAY_MAX = 480
  const ds = Math.min(1, DISPLAY_MAX / Math.max(img.width, img.height))
  return { src, w: Math.round(img.width * ds), h: Math.round(img.height * ds) }
}

export interface AudioRecording {
  src: string
  duration: number
}

export class AudioRecorder {
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private startedAt = 0
  private stopTimer: number | null = null

  get recording(): boolean {
    return this.recorder?.state === 'recording'
  }

  async start(maxSeconds = 30): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.chunks = []
    this.recorder = new MediaRecorder(stream)
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.startedAt = Date.now()
    this.recorder.start()
    this.stopTimer = window.setTimeout(() => void this.stop().catch(() => {}), maxSeconds * 1000)
  }

  async stop(): Promise<AudioRecording> {
    const recorder = this.recorder
    if (!recorder || recorder.state !== 'recording') throw new Error('not recording')
    if (this.stopTimer) clearTimeout(this.stopTimer)
    const duration = (Date.now() - this.startedAt) / 1000
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' }))
      recorder.stop()
    })
    recorder.stream.getTracks().forEach((t) => t.stop())
    this.recorder = null
    const src = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = reject
      r.readAsDataURL(blob)
    })
    return { src, duration }
  }
}

/** shared playback so only one clip plays at a time */
export class AudioPlayer {
  private current: { id: string; el: HTMLAudioElement } | null = null

  constructor(private onState: (id: string, playing: boolean) => void) {}

  toggle(id: string, src: string): void {
    if (this.current?.id === id) {
      this.stop()
      return
    }
    this.stop()
    const el = new Audio(src)
    el.onended = () => {
      this.onState(id, false)
      if (this.current?.id === id) this.current = null
    }
    void el.play()
    this.current = { id, el }
    this.onState(id, true)
  }

  stop(): void {
    if (this.current) {
      this.current.el.pause()
      this.onState(this.current.id, false)
      this.current = null
    }
  }
}
