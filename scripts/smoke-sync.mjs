// End-to-end sync smoke test: two clients join the same room over the
// real WebSocket server; one writes, the other must observe the value.
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import WebSocket from 'ws'

const room = 'smoke-' + Math.random().toString(36).slice(2, 8)
// Point at the nginx proxy (ws://localhost/yjs) to also cover the Docker upgrade path.
const endpoint = process.env.SMOKE_WS_URL ?? 'ws://localhost:1234/yjs'

function makeClient() {
  const doc = new Y.Doc()
  const provider = new WebsocketProvider(endpoint, room, doc, {
    WebSocketPolyfill: WebSocket,
  })
  return { doc, provider }
}

const a = makeClient()
const b = makeClient()

a.provider.on('sync', () => {
  a.doc.getMap('objects').set('o1', { hello: 'world' })
})

const t0 = Date.now()
const iv = setInterval(() => {
  const v = b.doc.getMap('objects').get('o1')
  if (v && v.hello === 'world') {
    console.log(`SYNC OK in ${Date.now() - t0}ms (room ${room} via ${endpoint})`)
    clearInterval(iv)
    a.provider.destroy()
    b.provider.destroy()
    process.exit(0)
  }
  if (Date.now() - t0 > 8000) {
    console.error('SYNC FAILED: value never arrived at second client')
    process.exit(1)
  }
}, 100)
