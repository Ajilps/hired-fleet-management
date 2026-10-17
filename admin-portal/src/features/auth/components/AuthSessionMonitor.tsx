import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/use-auth-store'
import { isAdminSessionActive } from '../validation/session-validation'

export function AuthSessionMonitor() {
  const queryClient = useQueryClient()
  const session = useAuthStore((state) => state.session)
  const clearSession = useAuthStore((state) => state.clearSession)

  useEffect(() => {
    if (!session) return
    let timeout: number
    function handleExpiry() {
      if (isAdminSessionActive(session)) {
        timeout = window.setTimeout(handleExpiry, Math.min(Date.parse(session.accessTokenExpiresAt) - Date.now(), 2_147_483_647))
      } else {
        void queryClient.cancelQueries()
        queryClient.removeQueries()
        clearSession(true)
      }
    }
    handleExpiry()
    return () => window.clearTimeout(timeout)
  }, [clearSession, queryClient, session])

  return null
}
