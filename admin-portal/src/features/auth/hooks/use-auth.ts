import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/use-auth-store'
import { signIn as requestSignIn, signOut as requestSignOut } from '../api/auth-service'
import { broadcastSessionChange } from '../session-events'

type SignInRequest = { email: string; password: string }

export function useAuth() {
  const queryClient = useQueryClient()
  const session = useAuthStore((state) => state.session)
  const hasSessionExpired = useAuthStore((state) => state.hasSessionExpired)
  const establishSession = useAuthStore((state) => state.establishSession)
  const clearSession = useAuthStore((state) => state.clearSession)
  const isSigningIn = useIsMutating({ mutationKey: ['auth', 'sign-in'] }) > 0
  const isSigningOut = useIsMutating({ mutationKey: ['auth', 'sign-out'] }) > 0

  const signInMutation = useMutation({
    mutationKey: ['auth', 'sign-in'],
    // Fail offline instead of queuing credentials for later replay.
    networkMode: 'always',
    retry: false,
    gcTime: 0,
    mutationFn: async ({ email, password }: SignInRequest) => {
      const revision = useAuthStore.getState().beginSessionChange()
      const adminSession = await requestSignIn(email, password)
      if (useAuthStore.getState().sessionRevision !== revision) return
      await queryClient.cancelQueries()
      if (useAuthStore.getState().sessionRevision !== revision) return
      queryClient.removeQueries()
      establishSession(adminSession)
      broadcastSessionChange()
      // Keep tokens out of the mutation result; Zustand owns the session.
    },
  })

  const signOutMutation = useMutation({
    mutationKey: ['auth', 'sign-out'],
    networkMode: 'always',
    retry: false,
    gcTime: 0,
    mutationFn: async () => {
      const revision = useAuthStore.getState().beginSessionChange()
      const currentSession = useAuthStore.getState().session
      if (!currentSession) return
      await requestSignOut(currentSession.accessToken)
      if (useAuthStore.getState().sessionRevision !== revision) return
      await queryClient.cancelQueries()
      if (useAuthStore.getState().sessionRevision !== revision) return
      queryClient.removeQueries()
      clearSession()
      broadcastSessionChange()
    },
  })

  async function handleSignIn(email: string, password: string) {
    try {
      await signInMutation.mutateAsync({ email, password })
    } finally {
      // Drop request variables, including credentials, after either outcome.
      signInMutation.reset()
    }
  }

  async function handleSignOut() {
    try {
      await signOutMutation.mutateAsync()
    } finally {
      signOutMutation.reset()
    }
  }

  return {
    session, hasSessionExpired, isSigningIn, isSigningOut,
    signIn: handleSignIn, signOut: handleSignOut,
  }
}
