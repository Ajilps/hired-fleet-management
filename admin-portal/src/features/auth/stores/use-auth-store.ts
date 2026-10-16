import { create } from 'zustand'
import type { AdminSession } from '../types/auth-types'

type AuthStore = {
  session: AdminSession | null
  hasSessionExpired: boolean
  establishSession: (session: AdminSession) => void
  clearSession: (hasSessionExpired?: boolean) => void
}

// Deliberately omit persistence and devtools for this credential-bearing store.
export const useAuthStore = create<AuthStore>()((set) => ({
  session: null,
  hasSessionExpired: typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('reason') === 'session-expired',
  establishSession: (session) => set({ session, hasSessionExpired: false }),
  clearSession: (hasSessionExpired = false) => set({ session: null, hasSessionExpired }),
}))
