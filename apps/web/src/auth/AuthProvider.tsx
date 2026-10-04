/**
 * AuthProvider — Google sign-in via Firebase Auth; upserts users/{uid} in Firestore.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db, firestoreErrorHint, googleProvider } from '../firebase/app'

type AuthContextValue = {
  user: User | null
  loading: boolean
  /** Soft warning when Firestore profile/meta is unreachable (sign-in still succeeds). */
  firestoreWarning: string | null
  clearFirestoreWarning: () => void
  signInWithGoogle: () => Promise<User>
  signOut: () => Promise<void>
  /** Ensure signed in; opens Google if needed. Returns user or throws. */
  requireAuth: () => Promise<User>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Merge-only upsert — no getDoc (avoids offline read failures blocking sign-in). */
async function upsertUserProfile(user: User): Promise<void> {
  const ref = doc(db, 'users', user.uid)
  const createdAt = user.metadata.creationTime ? new Date(user.metadata.creationTime) : serverTimestamp()
  await setDoc(
    ref,
    {
      displayName: user.displayName ?? '',
      email: user.email ?? '',
      photoURL: user.photoURL ?? '',
      lastLoginAt: serverTimestamp(),
      createdAt,
    },
    { merge: true },
  )
}

export function AuthProvider(props: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [firestoreWarning, setFirestoreWarning] = useState<string | null>(null)

  const clearFirestoreWarning = useCallback(() => setFirestoreWarning(null), [])

  const safeUpsert = useCallback(async (u: User) => {
    try {
      await upsertUserProfile(u)
      setFirestoreWarning(null)
    } catch (err) {
      console.warn('user profile upsert', err)
      setFirestoreWarning(firestoreErrorHint(err))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) await safeUpsert(result.user)
      })
      .catch((err) => console.warn('Firebase redirect sign-in', err))

    const unsub = onAuthStateChanged(auth, (next) => {
      if (cancelled) return
      setUser(next)
      setLoading(false)
      if (next) void safeUpsert(next)
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [safeUpsert])

  const signInWithGoogle = useCallback(async () => {
    try {
      const cred = await signInWithPopup(auth, googleProvider)
      // Do not block returning the user if Firestore is down.
      void safeUpsert(cred.user)
      return cred.user
    } catch (err: unknown) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: string }).code) : ''
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/popup-closed-by-user'
      ) {
        if (code === 'auth/popup-closed-by-user') throw err
        await signInWithRedirect(auth, googleProvider)
        throw new Error('Redirecting to Google sign-in…')
      }
      throw err
    }
  }, [safeUpsert])

  const signOut = useCallback(async () => {
    setFirestoreWarning(null)
    await firebaseSignOut(auth)
  }, [])

  const requireAuth = useCallback(async () => {
    if (auth.currentUser) return auth.currentUser
    return signInWithGoogle()
  }, [signInWithGoogle])

  const value = useMemo(
    () => ({
      user,
      loading,
      firestoreWarning,
      clearFirestoreWarning,
      signInWithGoogle,
      signOut,
      requireAuth,
    }),
    [user, loading, firestoreWarning, clearFirestoreWarning, signInWithGoogle, signOut, requireAuth],
  )

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
