/**
 * Load / performance — many clients join one room and burst updates.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import WebSocket from 'ws'
import { createServer } from '../apps/server/src/index'

const CLIENTS = 20
const UPDATES_PER = 5
const P95_BUDGET_MS = 2000

function waitSync(provider: WebsocketProvider, ms = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (provider.synced) return resolve()
    const t = setTimeout(() => reject(new Error('sync timeout')), ms)
    provider.once('sync', (synced: boolean) => {
      if (synced) {
        clearTimeout(t)
        resolve()
      }
    })
  })
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, i)]!
}

describe('load-ws', () => {
  let port = 0
  let close: () => Promise<void>

  beforeAll(async () => {
    process.env.DATA_DIR = process.env.DATA_DIR ?? `${process.cwd()}/data/test-rooms-load`
    const app = await createServer()
    await app.listen({ port: 0, host: '127.0.0.1' })
    const addr = app.server.address()
    if (!addr || typeof addr === 'string') throw new Error('no port')
    port = addr.port
    close = () => app.close()
  })

  afterAll(async () => {
    await close?.()
  })

  it(`syncs ${CLIENTS} clients within p95 ${P95_BUDGET_MS}ms`, async () => {
    const room = `load-${Math.random().toString(36).slice(2, 8)}`
    const base = `ws://127.0.0.1:${port}/yjs`
    const providers: WebsocketProvider[] = []
    const docs: Y.Doc[] = []

    for (let i = 0; i < CLIENTS; i++) {
      const doc = new Y.Doc()
      docs.push(doc)
      providers.push(
        new WebsocketProvider(base, room, doc, {
          WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
        }),
      )
    }

    await Promise.all(providers.map((p) => waitSync(p)))

    const latencies: number[] = []
    const tBurst = Date.now()

    for (let i = 0; i < CLIENTS; i++) {
      const map = docs[i]!.getMap('objects')
      for (let u = 0; u < UPDATES_PER; u++) {
        map.set(`c${i}-u${u}`, { i, u, t: Date.now() })
      }
    }

    const expected = CLIENTS * UPDATES_PER
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      const sizes = docs.map((d) => Object.keys(d.getMap('objects').toJSON()).length)
      if (sizes.every((n) => n >= expected)) break
      await new Promise((r) => setTimeout(r, 50))
    }

    const elapsed = Date.now() - tBurst
    latencies.push(elapsed)

    for (const d of docs) {
      expect(Object.keys(d.getMap('objects').toJSON()).length).toBeGreaterThanOrEqual(expected)
    }

    const p95 = percentile(latencies.sort((a, b) => a - b), 95)
    expect(p95).toBeLessThanOrEqual(P95_BUDGET_MS)

    for (const p of providers) p.destroy()
  }, 30_000)
})
