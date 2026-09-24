/**
 * Room snapshot storage — local filesystem (Docker/dev) or GCS (Cloud Run).
 * Set GCS_BUCKET to enable Cloud Storage; otherwise DATA_DIR/*.bin is used.
 */
import fs from 'node:fs'
import path from 'node:path'
import { Storage } from '@google-cloud/storage'

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data', 'rooms')

const GCS_BUCKET = (process.env.GCS_BUCKET ?? '').trim()

let storage: Storage | null = null

function gcs(): Storage {
  if (!storage) storage = new Storage()
  return storage
}

function safeName(roomId: string): string {
  return roomId.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function localPath(roomId: string): string {
  return path.join(DATA_DIR, `${safeName(roomId)}.bin`)
}

function objectPath(roomId: string): string {
  return `rooms/${safeName(roomId)}.bin`
}

/** Load Yjs state update bytes, or null if no snapshot exists. */
export async function loadRoomSnapshot(roomId: string): Promise<Uint8Array | null> {
  if (GCS_BUCKET) {
    const file = gcs().bucket(GCS_BUCKET).file(objectPath(roomId))
    const [exists] = await file.exists()
    if (!exists) return null
    const [buf] = await file.download()
    return new Uint8Array(buf)
  }

  const f = localPath(roomId)
  if (!fs.existsSync(f)) return null
  return new Uint8Array(fs.readFileSync(f))
}

/** Persist Yjs state update bytes. */
export async function saveRoomSnapshot(roomId: string, data: Uint8Array): Promise<void> {
  if (GCS_BUCKET) {
    const file = gcs().bucket(GCS_BUCKET).file(objectPath(roomId))
    await file.save(Buffer.from(data), {
      contentType: 'application/octet-stream',
      resumable: false,
    })
    return
  }

  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(localPath(roomId), data)
}

export function snapshotBackend(): 'gcs' | 'fs' {
  return GCS_BUCKET ? 'gcs' : 'fs'
}
