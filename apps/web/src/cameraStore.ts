/**
 * cameraStore — persist each board's pan/zoom across in-app tab switches.
 * Without this, remounting <Room key={roomId}> always fitToContent() and feels like a zoom-out bug.
 */
import type { Camera } from './canvas/CanvasApp'

const PREFIX = 'rcic-camera-'

export function loadCamera(roomId: string): Camera | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + roomId)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<Camera>
    if (
      typeof v.x === 'number' &&
      Number.isFinite(v.x) &&
      typeof v.y === 'number' &&
      Number.isFinite(v.y) &&
      typeof v.scale === 'number' &&
      Number.isFinite(v.scale) &&
      v.scale > 0
    ) {
      return { x: v.x, y: v.y, scale: v.scale }
    }
  } catch {
    /* ignore */
  }
  return null
}

export function saveCamera(roomId: string, cam: Camera): void {
  try {
    sessionStorage.setItem(PREFIX + roomId, JSON.stringify({ x: cam.x, y: cam.y, scale: cam.scale }))
  } catch {
    /* ignore quota */
  }
}
