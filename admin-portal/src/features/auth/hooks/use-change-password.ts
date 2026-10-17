import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/use-auth-store'
import { changeOwnPassword } from '../api/password-service'
import { PasswordChangeError } from '../errors/password-change-error'
import { broadcastSessionChange } from '../session-events'
import { useRetryDelay } from '../../../shared/hooks/use-retry-delay'

type Input = { currentPassword: string; newPassword: string }
export function useChangePassword() {
  const session = useAuthStore((state) => state.session)
  const queryClient = useQueryClient()
  const pendingInput = useRef<Input | null>(null)
  const controller = useRef<AbortController | null>(null)
  const isInFlight = useRef(false)
  const isMounted = useRef(true)
  const [error, setError] = useState<PasswordChangeError | null>(null)
  const delay = useRetryDelay(error)
  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false; pendingInput.current = null; controller.current?.abort() }
  }, [session?.accessToken])
  const mutation = useMutation({ mutationKey: ['auth', 'change-password'], networkMode: 'always', retry: false, gcTime: 0,
    // No credential-bearing mutation variables or result are stored.
    mutationFn: async () => {
      if (!session || !pendingInput.current || !controller.current) throw new PasswordChangeError('Sign in again to continue.')
      await changeOwnPassword(session.accessToken, pendingInput.current, controller.current.signal)
    },
  })
  async function run(input: Input) {
    if (!session || isInFlight.current || delay > 0 || error?.isUncertain) return false
    isInFlight.current = true
    const revision = useAuthStore.getState().beginSessionChange()
    pendingInput.current = { currentPassword: input.currentPassword, newPassword: input.newPassword }
    controller.current = new AbortController()
    setError(null)
    const isCurrent = () => isMounted.current && useAuthStore.getState().sessionRevision === revision && useAuthStore.getState().session?.accessToken === session.accessToken
    try {
      await mutation.mutateAsync()
      if (!isCurrent()) return false
      await queryClient.cancelQueries()
      if (!isCurrent()) return false
      queryClient.removeQueries()
      useAuthStore.getState().clearSession()
      broadcastSessionChange()
      return true
    } catch (failure) {
      if (isCurrent()) setError(failure instanceof PasswordChangeError ? failure : new PasswordChangeError('The password change could not be confirmed. Sign out and sign in again.', true))
      return false
    } finally {
      pendingInput.current = null
      controller.current = null
      isInFlight.current = false
      mutation.reset()
    }
  }
  return { run, error, delay, isPending: mutation.isPending, isUncertain: error?.isUncertain ?? false }
}
