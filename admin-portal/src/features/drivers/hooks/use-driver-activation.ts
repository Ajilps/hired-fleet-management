import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../auth'
import { ApiError } from '../../../shared/api/api-client'
import { useRetryDelay } from '../../../shared/hooks/use-retry-delay'
import { getDriverActivationReadiness } from '../api/driver-activation-service'
import { activateDriver } from '../api/driver-service'
import type { Driver } from '../types/driver-types'

export function useDriverActivationReadiness(driverId: string, enabled: boolean) {
  const session = useAuthStore((state) => state.session)
  return useQuery({ queryKey: ['driver-activation-readiness', session?.user.email, driverId], enabled: Boolean(session) && enabled, retry: false, networkMode: 'always', refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: ({ signal }) => getDriverActivationReadiness(driverId, session!.accessToken, signal),
  })
}

type ActivationIntent = { reason: string; key: string; before: Driver | null; dispatched: boolean; uncertain: boolean }
export function useActivateDriver(driverId: string) {
  const session = useAuthStore((state) => state.session)
  const queryClient = useQueryClient()
  const intent = useRef<ActivationIntent | null>(null)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(false)
  const [error, setError] = useState<Error | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const [needsReview, setNeedsReview] = useState(false)
  const delay = useRetryDelay(error)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; controller.current?.abort(); controller.current = null; intent.current = null }
  }, [driverId, session?.accessToken])
  const mutation = useMutation({ mutationKey: ['activate-driver', session?.user.email, driverId], retry: false, networkMode: 'always', gcTime: 0,
    mutationFn: async () => {
      const command = intent.current!
      const request = controller.current!
      try {
        if (!command.uncertain) {
          command.dispatched = false
          const readiness = await getDriverActivationReadiness(driverId, session!.accessToken, request.signal)
          request.signal.throwIfAborted()
          if (!readiness.ready) throw new ApiError(422, readiness.blockers.join(' '))
          command.before = readiness.driver
        }
        request.signal.throwIfAborted()
        if (useAuthStore.getState().session?.accessToken !== session?.accessToken) return
        command.dispatched = true
        return await activateDriver(command.before!, command.reason, command.key, session!.accessToken, request.signal)
      } catch (failure) {
        // Abandoned reads/writes cannot expire a later session through the global 401 handler.
        if (request.signal.aborted || useAuthStore.getState().session?.accessToken !== session?.accessToken) return
        throw failure
      }
    },
  })
  async function run(reason: string) {
    if (!session || controller.current || delay > 0 || needsReview) return
    if (!intent.current?.uncertain) {
      const normalized = reason.trim()
      if (!normalized || normalized.length > 500) { setError(new ApiError(422, 'Enter an activation reason of 1–500 characters.')); return }
      if (!intent.current || intent.current.reason !== normalized) intent.current = { reason: normalized, key: crypto.randomUUID(), before: null, dispatched: false, uncertain: false }
    }
    const command = intent.current!
    const request = new AbortController()
    controller.current = request
    setError(null)
    const isCurrent = () => mounted.current && controller.current === request && useAuthStore.getState().session?.accessToken === session.accessToken
    try {
      const saved = await mutation.mutateAsync()
      if (!isCurrent() || !saved) return
      intent.current = null
      setUncertain(false)
      setNeedsReview(false)
      queryClient.setQueryData(['driver', session.user.email, driverId], saved)
      void queryClient.invalidateQueries({ queryKey: ['drivers', session.user.email] })
      void queryClient.invalidateQueries({ queryKey: ['driver-activation-readiness', session.user.email, driverId] })
      return saved
    } catch (failure) {
      if (!isCurrent()) return
      const nextError = failure instanceof Error ? failure : new Error('Activation could not be confirmed.')
      const ambiguous = command.dispatched && nextError instanceof ApiError && (nextError.status === 0 || nextError.status >= 500 || nextError.code === 'COMMAND_IN_PROGRESS')
      const throttled = nextError instanceof ApiError && nextError.status === 429
      command.uncertain = ambiguous || (command.uncertain && throttled)
      setUncertain(command.uncertain)
      setNeedsReview(!command.uncertain && !throttled)
      if (!command.uncertain && !throttled) intent.current = null
      setError(nextError)
    } finally { request.abort(); if (controller.current === request) { controller.current = null; mutation.reset() } }
  }
  function completeReview() {
    if (controller.current || uncertain || delay > 0) return
    intent.current = null
    setError(null)
    setNeedsReview(false)
  }
  return { run, completeReview, error, uncertain, needsReview, delay, isPending: mutation.isPending }
}
