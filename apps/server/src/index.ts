/**
 * RCIC HTTP API — room id minting + health. Yjs sync is attached to the same HTTP server via upgrade.
 */
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { nanoid } from 'nanoid'
import { setupYjs } from './yjsServer'

export async function createServer() {
  const app = Fastify({ logger: { level: 'warn' } })

  await app.register(cors, { origin: true })

  // the rooms API has no request bodies; accept any content type without parsing
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, _body, done) => done(null, undefined))

  app.get('/health', async () => ({ ok: true }))

  app.post('/rooms', async () => ({ roomId: nanoid(10) }))

  setupYjs(app.server)

  return app
}

/** Auto-listen when executed as the process entrypoint (not under Vitest). */
if (process.env.VITEST !== 'true') {
  const PORT = Number(process.env.PORT ?? 1234)
  const app = await createServer()
  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`RCIC server listening on http://localhost:${PORT} (yjs at ws://localhost:${PORT}/yjs/:room)`)
}
