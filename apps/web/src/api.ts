import { nanoid } from 'nanoid'
import { API_URL } from './config'

/** Create a new room id via the server, falling back to a client-generated id. */
export async function createRoomId(): Promise<string> {
  let roomId = nanoid(10)
  try {
    const res = await fetch(`${API_URL}/rooms`, { method: 'POST' })
    if (res.ok) roomId = (await res.json()).roomId
  } catch {
    // offline-first: use client-generated id
  }
  return roomId
}
