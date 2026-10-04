/**
 * Firestore board metadata — ownership + membership. Canvas bytes stay in Yjs.
 * Listeners use onSnapshot so metadata updates are realtime.
 */
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { auth, db, firestoreErrorHint } from './app'

export type BoardMeta = {
  id: string
  ownerId: string
  name: string
  memberIds: string[]
  createdAtMs: number | null
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      last = err
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)))
    }
  }
  throw last
}

function parseBoard(id: string, data: Record<string, unknown> | undefined): BoardMeta | null {
  if (!data) return null
  const createdAt = data.createdAt as { toMillis?: () => number } | number | null | undefined
  let createdAtMs: number | null = null
  if (typeof createdAt === 'number') createdAtMs = createdAt
  else if (createdAt && typeof createdAt.toMillis === 'function') createdAtMs = createdAt.toMillis()
  return {
    id,
    ownerId: String(data.ownerId ?? ''),
    name: String(data.name ?? 'Untitled board'),
    memberIds: Array.isArray(data.memberIds) ? data.memberIds.map(String) : [],
    createdAtMs,
  }
}

export async function createBoardMeta(roomId: string, name = 'Untitled board'): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Must be signed in to create a board')
  try {
    await withRetry(() =>
      setDoc(doc(db, 'boards', roomId), {
        ownerId: uid,
        name,
        createdAt: serverTimestamp(),
        memberIds: [uid],
      }),
    )
  } catch (err) {
    throw new Error(firestoreErrorHint(err))
  }
}

/** Ensure the signed-in user is listed as a member (invite-link join). */
export async function ensureBoardMember(roomId: string): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Must be signed in to join a board')
  const ref = doc(db, 'boards', roomId)
  try {
    await withRetry(async () => {
      const snap = await getDoc(ref)
      if (!snap.exists()) {
        await setDoc(
          ref,
          {
            ownerId: uid,
            name: 'Untitled board',
            createdAt: serverTimestamp(),
            memberIds: [uid],
          },
          { merge: true },
        )
        return
      }
      const members = (snap.data().memberIds as string[] | undefined) ?? []
      if (members.includes(uid)) return
      await updateDoc(ref, { memberIds: arrayUnion(uid) })
    })
  } catch (err) {
    throw new Error(firestoreErrorHint(err))
  }
}

/** Persist board title to Firestore (Yjs remains source of truth for live canvas rename). */
export async function updateBoardName(roomId: string, name: string): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) return
  const trimmed = name.trim() || 'Untitled board'
  try {
    await withRetry(() => updateDoc(doc(db, 'boards', roomId), { name: trimmed }))
  } catch (err) {
    // Soft-fail: canvas rename already applied via Yjs
    console.warn('board name sync', firestoreErrorHint(err))
  }
}

/** Realtime single-board metadata (membership, name). */
export function subscribeBoard(
  roomId: string,
  onNext: (board: BoardMeta | null) => void,
  onError?: (message: string) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'boards', roomId),
    (snap) => {
      onNext(snap.exists() ? parseBoard(snap.id, snap.data() as Record<string, unknown>) : null)
    },
    (err) => {
      console.warn('board subscribe', err)
      onError?.(firestoreErrorHint(err))
    },
  )
}

/** Realtime list of boards the signed-in user belongs to. */
export function subscribeMyBoards(
  uid: string,
  onNext: (boards: BoardMeta[]) => void,
  onError?: (message: string) => void,
): Unsubscribe {
  const q = query(collection(db, 'boards'), where('memberIds', 'array-contains', uid))
  return onSnapshot(
    q,
    (snap) => {
      const boards = snap.docs
        .map((d) => parseBoard(d.id, d.data() as Record<string, unknown>))
        .filter((b): b is BoardMeta => !!b)
        .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0))
      onNext(boards)
    },
    (err) => {
      console.warn('my boards subscribe', err)
      onError?.(firestoreErrorHint(err))
      onNext([])
    },
  )
}
