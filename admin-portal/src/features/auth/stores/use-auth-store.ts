import { create } from 'zustand'
import type { AdminSession } from '../types/auth-types'

type AuthStore = {
  sessionRevision: number
  beginSessionChange: () => number
  session: AdminSession | null
  hasSessionExpired: boolean
  establishSession: (session: AdminSession) => void
  clearSession: (hasSessionExpired?: boolean) => void
}

// Deliberately omit persistence and devtools for this credential-bearing store.
export const useAuthStore = create<AuthStore>()((set, get) => ({
  sessionRevision: 0,
  beginSessionChange: () => { const revision = get().sessionRevision + 1; set({ sessionRevision: revision }); return revision },
  session: null,
  hasSessionExpired: typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('reason') === 'session-expired',
  establishSession: (session) => set((state) => ({ session, hasSessionExpired: false, sessionRevision: state.sessionRevision + 1 })),
  clearSession: (hasSessionExpired = false) => set((state) => ({ session: null, hasSessionExpired, sessionRevision: state.sessionRevision + 1 })),
}))
