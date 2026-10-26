import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../auth'
import { ApiError } from '../../../shared/api/api-client'
import { useRetryDelay } from '../../../shared/hooks/use-retry-delay'
import { createCompany } from '../api/company-service'
import type { CreateCompanyInput } from '../types/company-types'

export function useCreateCompany() {
  const session = useAuthStore((state) => state.session)
  const queryClient = useQueryClient()
  const intent = useRef<{ input: CreateCompanyInput; key: string; isUncertain: boolean } | null>(null)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const [error, setError] = useState<Error | null>(null)
  const [isUncertain, setIsUncertain] = useState(false)
  const delay = useRetryDelay(error)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const mutation = useMutation({ mutationKey: ['create-company', session?.user.email], retry: false, networkMode: 'always', gcTime: 0,
    mutationFn: ({ input, key }: { input: CreateCompanyInput; key: string }) => {
      if (!session) throw new ApiError(401, 'Sign in again to continue.')
      return createCompany(input, key, session.accessToken)
    },
  })
  async function run(input: CreateCompanyInput | null) {
    if (inFlight.current || delay > 0 || !session) return
    if (!intent.current?.isUncertain) {
      if (!input) return
      if (!intent.current || JSON.stringify(intent.current.input) !== JSON.stringify(input)) intent.current = { input: structuredClone(input), key: crypto.randomUUID(), isUncertain: false }
    }
    const command = intent.current!
    inFlight.current = true
    setError(null)
    const isCurrentSession = () => mounted.current && useAuthStore.getState().session?.accessToken === session.accessToken
    try {
      const company = await mutation.mutateAsync(command)
      if (!isCurrentSession()) return
      intent.current = null
      setIsUncertain(false)
      void Promise.all(['companies', 'company-options', 'company-option'].map((root) => queryClient.invalidateQueries({ queryKey: [root, session.user.email] })))
      queryClient.setQueryData(['company', session.user.email, company.id], company)
      return company
    } catch (failure) {
      if (!isCurrentSession()) return
      const nextError = failure instanceof Error ? failure : new Error('The company could not be saved.')
      const isAmbiguous = nextError instanceof ApiError && (nextError.status === 0 || nextError.status >= 500 || nextError.code === 'COMMAND_IN_PROGRESS')
      const isThrottled = nextError instanceof ApiError && nextError.status === 429
      command.isUncertain = isAmbiguous || (command.isUncertain && isThrottled)
      setIsUncertain(command.isUncertain)
      if (!command.isUncertain && !isThrottled) intent.current = null
      setError(nextError)
    } finally {
      inFlight.current = false
      mutation.reset()
    }
  }
  return { run, error, isUncertain, delay, isPending: mutation.isPending }
}
