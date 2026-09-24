/**
 * Yjs WebSocket relay — one Room (Y.Doc + awareness) per board id.
 * Debounced binary snapshots (fs or GCS via roomStore) survive process restarts.
 * Clients speak y-protocols sync (0) and awareness (1); we never interpret object schemas here.
 */
import { WebSocketServer, WebSocket, type RawData } from 'ws'
import type { Server, IncomingMessage } from 'node:http'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { loadRoomSnapshot, saveRoomSnapshot, snapshotBackend } from './roomStore'

const MSG_SYNC = 0
const MSG_AWARENESS = 1
const SAVE_DEBOUNCE_MS = 3000

class Room {
  readonly doc = new Y.Doc()
  readonly awareness: awarenessProtocol.Awareness
  readonly conns = new Map<WebSocket, Set<number>>()
  private saveTimer: NodeJS.Timeout | null = null
  private dirty = false
  private ready: Promise<void>

  private constructor(readonly name: string) {
    this.awareness = new awarenessProtocol.Awareness(this.doc)
    this.awareness.setLocalState(null)
    this.ready = this.load()

    this.doc.on('update', (update: Uint8Array) => {
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MSG_SYNC)
      syncProtocol.writeUpdate(enc, update)
      this.broadcast(encoding.toUint8Array(enc))
      this.dirty = true
      this.scheduleSave()
    })

    this.awareness.on(
      'update',
      (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
      ) => {
        const changed = added.concat(updated, removed)
        if (origin instanceof WebSocket || (origin && this.conns.has(origin as WebSocket))) {
          const ids = this.conns.get(origin as WebSocket)
          if (ids) {
            added.forEach((id) => ids.add(id))
            removed.forEach((id) => ids.delete(id))
          }
        }
        const enc = encoding.createEncoder()
        encoding.writeVarUint(enc, MSG_AWARENESS)
        encoding.writeVarUint8Array(
          enc,
          awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed),
        )
        this.broadcast(encoding.toUint8Array(enc))
      },
    )
  }

  static async create(name: string): Promise<Room> {
    const room = new Room(name)
    await room.ready
    return room
  }

  private async load(): Promise<void> {
    try {
      const data = await loadRoomSnapshot(this.name)
      if (data && data.byteLength > 0) Y.applyUpdate(this.doc, data)
    } catch (err) {
      console.error(`[room ${this.name}] failed to load snapshot`, err)
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return
    try {
      await saveRoomSnapshot(this.name, Y.encodeStateAsUpdate(this.doc))
      this.dirty = false
    } catch (err) {
      console.error(`[room ${this.name}] failed to save snapshot`, err)
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.save()
    }, SAVE_DEBOUNCE_MS)
  }

  private broadcast(buf: Uint8Array): void {
    this.conns.forEach((_ids, ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(buf)
    })
  }

  addConnection(ws: WebSocket): void {
    this.conns.set(ws, new Set())

    ws.on('message', (data: RawData) => this.onMessage(ws, data))
    ws.on('close', () => this.removeConnection(ws))
    ws.on('error', () => this.removeConnection(ws))

    // sync step 1
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, MSG_SYNC)
    syncProtocol.writeSyncStep1(enc, this.doc)
    ws.send(encoding.toUint8Array(enc))

    // current awareness states
    const states = this.awareness.getStates()
    if (states.size > 0) {
      const enc2 = encoding.createEncoder()
      encoding.writeVarUint(enc2, MSG_AWARENESS)
      encoding.writeVarUint8Array(
        enc2,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(states.keys())),
      )
      ws.send(encoding.toUint8Array(enc2))
    }
  }

  private removeConnection(ws: WebSocket): void {
    const ids = this.conns.get(ws)
    if (!ids) return
    this.conns.delete(ws)
    awarenessProtocol.removeAwarenessStates(this.awareness, Array.from(ids), null)
    if (this.conns.size === 0) {
      this.dirty = true
      void this.save()
    }
  }

  private onMessage(ws: WebSocket, data: RawData): void {
    try {
      const buf = new Uint8Array(data as Buffer)
      const dec = decoding.createDecoder(buf)
      const type = decoding.readVarUint(dec)
      switch (type) {
        case MSG_SYNC: {
          const enc = encoding.createEncoder()
          encoding.writeVarUint(enc, MSG_SYNC)
          syncProtocol.readSyncMessage(dec, enc, this.doc, ws)
          if (encoding.length(enc) > 1) ws.send(encoding.toUint8Array(enc))
          break
        }
        case MSG_AWARENESS: {
          awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(dec), ws)
          break
        }
      }
    } catch (err) {
      console.error(`[room ${this.name}] message error`, err)
    }
  }
}

const rooms = new Map<string, Room>()
/** In-flight creates so concurrent upgrades for the same room share one load. */
const pending = new Map<string, Promise<Room>>()

export function setupYjs(server: Server): void {
  const wss = new WebSocketServer({ noServer: true })
  console.log(`[yjs] snapshot backend: ${snapshotBackend()}`)

  server.on('upgrade', (req, socket, head) => {
    const url = req.url ?? ''
    if (!url.startsWith('/yjs/')) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    void (async () => {
      const name = decodeURIComponent((req.url ?? '').slice('/yjs/'.length).split('?')[0]!)
      if (!name) {
        ws.close()
        return
      }
      let room = rooms.get(name)
      if (!room) {
        let creating = pending.get(name)
        if (!creating) {
          creating = Room.create(name).then((r) => {
            rooms.set(name, r)
            pending.delete(name)
            return r
          })
          pending.set(name, creating)
        }
        try {
          room = await creating
        } catch (err) {
          console.error(`[yjs] failed to open room ${name}`, err)
          ws.close()
          return
        }
      }
      if (ws.readyState !== WebSocket.OPEN) return
      ws.binaryType = 'arraybuffer'
      room.addConnection(ws)
    })()
  })

  // keepalive: terminate dead sockets
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const w = ws as WebSocket & { isAlive?: boolean }
      if (w.isAlive === false) return w.terminate()
      w.isAlive = false
      w.ping()
    })
  }, 30000)
  wss.on('connection', (ws) => {
    const w = ws as WebSocket & { isAlive?: boolean }
    w.isAlive = true
    ws.on('pong', () => {
      w.isAlive = true
    })
  })
  wss.on('close', () => clearInterval(interval))

  process.on('SIGINT', () => {
    void Promise.all([...rooms.values()].map((r) => r.save())).finally(() => process.exit(0))
  })
}
