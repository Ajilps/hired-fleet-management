import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/use-auth-store'
import { isAdminSessionActive } from '../validation/session-validation'
import { refreshBrowserSession } from '../api/auth-service'
import { subscribeSessionChanges } from '../session-events'

export function AuthSessionMonitor() {
  const queryClient = useQueryClient()
  const session = useAuthStore((state) => state.session)
  const sessionRevision = useAuthStore((state) => state.sessionRevision)
  const clearSession = useAuthStore((state) => state.clearSession)

  useEffect(() => subscribeSessionChanges(() => {
      void queryClient.cancelQueries()
      queryClient.removeQueries()
      clearSession()
  }), [clearSession, queryClient])

  useEffect(() => {
    if (!session) return
    let timeout: number
    let isCurrent = true
    const revision = useAuthStore.getState().sessionRevision
    async function renew() {
      try {
        const refreshed = await refreshBrowserSession()
        if (!isCurrent || useAuthStore.getState().sessionRevision !== revision) return
        await queryClient.cancelQueries()
        if (!isCurrent || useAuthStore.getState().sessionRevision !== revision) return
        queryClient.removeQueries()
        if (refreshed) useAuthStore.getState().establishSession(refreshed)
        else clearSession(true)
      } catch {
        if (!isCurrent || useAuthStore.getState().sessionRevision !== revision) return
        void queryClient.cancelQueries()
        queryClient.removeQueries()
        clearSession(true)
      }
    }
    function handleExpiry() {
      if (session?.isBrowserSession && Date.parse(session.accessTokenExpiresAt) - Date.now() <= 30_000) { void renew(); return }
      if (isAdminSessionActive(session)) {
        timeout = window.setTimeout(handleExpiry, Math.min(Date.parse(session.accessTokenExpiresAt) - Date.now() - (session?.isBrowserSession ? 30_000 : 0), 2_147_483_647))
      } else {
        void queryClient.cancelQueries()
        queryClient.removeQueries()
        clearSession(true)
      }
    }
    handleExpiry()
    return () => { isCurrent = false; window.clearTimeout(timeout) }
  }, [clearSession, queryClient, session, sessionRevision])

  return null
}
