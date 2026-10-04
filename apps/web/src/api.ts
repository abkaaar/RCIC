import { API_URL } from './config'

export class ServerUnavailableError extends Error {
  constructor(message = 'Sync server is unreachable. Start it with `npm run dev` or Docker, then retry.') {
    super(message)
    this.name = 'ServerUnavailableError'
  }
}

/** Health probe for the Yjs / rooms Fastify server. */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { method: 'GET' })
    if (!res.ok) return false
    const body = (await res.json()) as { ok?: boolean }
    return body.ok === true
  } catch {
    return false
  }
}

/**
 * Create a new room id via the server.
 * For signed-in create flows, set `requireServer: true` so we never silently mint a client id.
 */
export async function createRoomId(opts?: { requireServer?: boolean }): Promise<string> {
  const requireServer = opts?.requireServer ?? false
  try {
    const res = await fetch(`${API_URL}/rooms`, { method: 'POST' })
    if (res.ok) {
      const data = (await res.json()) as { roomId?: string }
      if (data.roomId) return data.roomId
    }
    if (requireServer) {
      throw new ServerUnavailableError(
        `Sync server rejected room create (HTTP ${res.status}). Start the server with \`npm run dev\` or Docker.`,
      )
    }
  } catch (err) {
    if (err instanceof ServerUnavailableError) throw err
    if (requireServer) throw new ServerUnavailableError()
  }
  // Dev / offline fallback only when server is not required
  const { nanoid } = await import('nanoid')
  return nanoid(10)
}
