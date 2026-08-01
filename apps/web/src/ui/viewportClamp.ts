/**
 * viewportClamp — keep floating overlays inside the visible viewport (ISS-051).
 */

export function clampOverlayRect(args: {
  left: number
  top: number
  width: number
  height: number
  pad?: number
}): { left: number; top: number } {
  const pad = args.pad ?? 8
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const w = Math.max(0, Math.min(args.width, vw - pad * 2))
  const h = Math.max(0, Math.min(args.height, vh - pad * 2))
  const left = Math.min(Math.max(args.left, pad), Math.max(pad, vw - pad - w))
  const top = Math.min(Math.max(args.top, pad), Math.max(pad, vh - pad - h))
  return { left, top }
}

/** Clamp a horizontal-centered panel (CSS translateX(-50%)) so edges stay on-screen. */
export function clampCenteredLeft(centerX: number, width: number, pad = 8): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const half = Math.min(width, vw - pad * 2) / 2
  return Math.min(Math.max(centerX, pad + half), Math.max(pad + half, vw - pad - half))
}
