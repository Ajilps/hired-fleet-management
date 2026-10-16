import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../auth'
import { ApiError } from '../../../shared/api/api-client'
import { useRetryDelay } from '../../../shared/hooks/use-retry-delay'

export function useOrderCommand<TInput, TResult>(request: (input: TInput, key: string, token: string) => Promise<TResult>) {
  const queryClient = useQueryClient()
  const session = useAuthStore((state) => state.session)
  const intent = useRef<{ fingerprint: string; key: string } | null>(null)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [error, setError] = useState<Error | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const delay = useRetryDelay(error)
  const mutation = useMutation({
    mutationKey: ['order-command', session?.user.email], retry: false, networkMode: 'always', gcTime: 0,
    mutationFn: ({ input, key }: { input: TInput; key: string }) => {
      if (!session) throw new ApiError(401, 'Sign in again to continue.')
      return request(input, key, session.accessToken)
    },
  })

  async function run(input: TInput): Promise<TResult | undefined> {
    if (inFlight.current || delay > 0) return
    const fingerprint = JSON.stringify(input)
    if (uncertain && intent.current?.fingerprint !== fingerprint) return
    if (!intent.current || intent.current.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID() }
    inFlight.current = true
    setError(null)
    try {
      const result = await mutation.mutateAsync({ input, key: intent.current.key })
      if (!mounted.current || useAuthStore.getState().session?.accessToken !== session?.accessToken) return
      intent.current = null
      setUncertain(false)
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orders', session?.user.email] }),
        queryClient.invalidateQueries({ queryKey: ['overview', session?.user.email] }),
      ])
      return result
    } catch (failure) {
      const nextError = failure instanceof Error ? failure : new Error('The request could not be completed.')
      const ambiguous = nextError instanceof ApiError && (nextError.status === 0 || nextError.status >= 500 || nextError.code === 'COMMAND_IN_PROGRESS')
      setUncertain(ambiguous)
      if (!ambiguous && !(nextError instanceof ApiError && nextError.status === 429)) intent.current = null
      setError(nextError)
      return
    } finally {
      inFlight.current = false
      mutation.reset()
    }
  }
  function clearError() {
    if (inFlight.current || uncertain || delay > 0) return
    setError(null)
    intent.current = null
  }
  return { run, error, uncertain, delay, isPending: mutation.isPending, clearError }
}
