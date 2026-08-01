/**
 * Live WebSocket race — two providers write concurrently; both docs converge.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import WebSocket from 'ws'
import { createServer } from '../apps/server/src/index'

function waitSync(provider: WebsocketProvider, ms = 8000): Promise<void> {
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

function waitUntil(fn: () => boolean, ms = 8000): Promise<void> {
  const t0 = Date.now()
  return new Promise((resolve, reject) => {
    const iv = setInterval(() => {
      if (fn()) {
        clearInterval(iv)
        resolve()
      } else if (Date.now() - t0 > ms) {
        clearInterval(iv)
        reject(new Error('condition timeout'))
      }
    }, 40)
  })
}

describe('race-ws (live)', () => {
  let port = 0
  let close: () => Promise<void>

  beforeAll(async () => {
    process.env.DATA_DIR = process.env.DATA_DIR ?? `${process.cwd()}/data/test-rooms-race`
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

  it('two clients concurrent writes converge', async () => {
    const room = `race-${Math.random().toString(36).slice(2, 8)}`
    const base = `ws://127.0.0.1:${port}/yjs`

    const docA = new Y.Doc()
    const docB = new Y.Doc()
    const a = new WebsocketProvider(base, room, docA, { WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket })
    const b = new WebsocketProvider(base, room, docB, { WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket })

    await Promise.all([waitSync(a), waitSync(b)])

    docA.getMap('objects').set('ka', { from: 'A' })
    docB.getMap('objects').set('kb', { from: 'B' })

    await waitUntil(() => {
      const ja = docA.getMap('objects').toJSON() as Record<string, { from?: string }>
      const jb = docB.getMap('objects').toJSON() as Record<string, { from?: string }>
      return ja.ka?.from === 'A' && ja.kb?.from === 'B' && jb.ka?.from === 'A' && jb.kb?.from === 'B'
    })

    expect(docA.getMap('objects').toJSON()).toEqual(docB.getMap('objects').toJSON())

    a.destroy()
    b.destroy()
  })
})
