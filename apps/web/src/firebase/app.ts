/**
 * Firebase client — Auth + Firestore for RC-board (project rc-board-b63dc).
 * Live canvas sync remains Yjs; this module is identity + board metadata only.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth'
import { initializeFirestore, type Firestore } from 'firebase/firestore'

function requireEnv(key: string): string {
  const v = import.meta.env[key] as string | undefined
  if (!v?.trim()) {
    throw new Error(`Missing ${key}. Copy apps/web/.env.example to .env.local and fill Firebase config.`)
  }
  return v.trim()
}

const firebaseConfig = {
  apiKey: requireEnv('VITE_FIREBASE_API_KEY'),
  authDomain: requireEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: requireEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: requireEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requireEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requireEnv('VITE_FIREBASE_APP_ID'),
  measurementId: (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined)?.trim() || undefined,
}

export const app: FirebaseApp = initializeApp(firebaseConfig)
export const auth: Auth = getAuth(app)

/** Long-polling helps when WebChannel is blocked (some proxies / corp networks). */
export const db: Firestore = initializeFirestore(app, {
  experimentalForceLongPolling: true,
})

export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

/** Human-readable hint when Firestore cannot be reached (often DB not created). */
export function firestoreErrorHint(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const offline =
    /client is offline/i.test(msg) ||
    /Failed to get document because the client is offline/i.test(msg) ||
    /unavailable/i.test(msg)
  if (offline) {
    return (
      'Firestore is unreachable. In Firebase Console for rc-board-b63dc, open Build → Firestore Database → Create database, ' +
      'then run: firebase deploy --only firestore:rules'
    )
  }
  return msg || 'Firestore request failed'
}
