import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../auth'
import { ApiError } from '../../../shared/api/api-client'
import { useRetryDelay } from '../../../shared/hooks/use-retry-delay'
import { createCompanyPartner } from '../api/partner-service'
import type { CreatePartnerInput } from '../types/partner-types'

export function useProvisionPartner(companyId: string) {
  const session = useAuthStore((state) => state.session)
  const queryClient = useQueryClient()
  const intent = useRef<{ input: CreatePartnerInput; key: string; isUncertain: boolean } | null>(null)
  const controller = useRef<AbortController | null>(null)
  const isInFlight = useRef(false)
  const isMounted = useRef(true)
  const [error, setError] = useState<Error | null>(null)
  const [isUncertain, setIsUncertain] = useState(false)
  const delay = useRetryDelay(error)
  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false; intent.current = null; controller.current?.abort() }
  }, [companyId, session?.accessToken])
  const mutation = useMutation({ mutationKey: ['provision-partner', session?.user.email, companyId], retry: false, networkMode: 'always', gcTime: 0,
    // Credentials stay in a private in-memory ref, outside mutation variables/results.
    mutationFn: () => {
      const command = intent.current
      if (!session || !command) throw new ApiError(401, 'Sign in again to continue.')
      return createCompanyPartner(companyId, command.input, command.key, session.accessToken, controller.current!.signal)
    },
  })
  async function run(input: CreatePartnerInput | null) {
    if (!session || isInFlight.current || delay > 0) return
    if (!intent.current?.isUncertain) {
      if (!input) return
      if (!intent.current || JSON.stringify(intent.current.input) !== JSON.stringify(input)) intent.current = { input: structuredClone(input), key: crypto.randomUUID(), isUncertain: false }
    }
    const command = intent.current!
    controller.current = new AbortController()
    isInFlight.current = true
    setError(null)
    const isCurrentSession = () => isMounted.current && useAuthStore.getState().session?.accessToken === session.accessToken
    try {
      const partner = await mutation.mutateAsync()
      if (!isCurrentSession()) return
      intent.current = null
      setIsUncertain(false)
      void queryClient.invalidateQueries({ queryKey: ['company-partners', session.user.email, companyId] })
      return partner
    } catch (failure) {
      if (!isCurrentSession()) return
      const nextError = failure instanceof Error ? failure : new Error('Partner account setup could not be completed.')
      const isAmbiguous = nextError instanceof ApiError && (nextError.status === 0 || nextError.status >= 500 || nextError.code === 'COMMAND_IN_PROGRESS')
      const isThrottled = nextError instanceof ApiError && nextError.status === 429
      command.isUncertain = isAmbiguous || (command.isUncertain && isThrottled)
      setIsUncertain(command.isUncertain)
      if (!command.isUncertain && !isThrottled) intent.current = null
      setError(nextError)
    } finally {
      isInFlight.current = false
      controller.current = null
      mutation.reset()
    }
  }
  return { run, error, delay, isUncertain, isPending: mutation.isPending }
}
