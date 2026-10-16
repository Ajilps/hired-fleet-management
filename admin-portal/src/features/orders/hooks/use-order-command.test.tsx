import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { ApiError } from '../../../shared/api/api-client'
import { createAdminSession } from '../../../test/auth-fixtures'
import { createTestQueryClient } from '../../../test/query-clients'
import { useOrderCommand } from './use-order-command'

function renderCommand(request: (input: { value: string }, key: string, token: string) => Promise<string>) {
  useAuthStore.getState().establishSession(createAdminSession())
  const queryClient = createTestQueryClient()
  function Wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> }
  return { queryClient, ...renderHook(() => useOrderCommand(request), { wrapper: Wrapper }) }
}

describe('order command identity and lifecycle', () => {
  it('locks ambiguous creation to the same intent/key and discards settled mutation data', async () => {
    const request = vi.fn().mockRejectedValueOnce(new ApiError(0, 'Interrupted')).mockResolvedValueOnce('saved-order')
    const { result, queryClient } = renderCommand(request)
    await act(async () => { await result.current.run({ value: 'original' }) })
    expect(result.current.uncertain).toBe(true)
    await act(async () => { await result.current.run({ value: 'changed' }) })
    expect(request).toHaveBeenCalledTimes(1)
    await act(async () => { expect(await result.current.run({ value: 'original' })).toBe('saved-order') })
    expect(request.mock.calls[0][1]).toBe(request.mock.calls[1][1])
    expect(result.current.uncertain).toBe(false)
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0))
  })
  it('prevents duplicate requests before React can render the pending state', async () => {
    let complete!: (value: string) => void
    const request = vi.fn().mockReturnValue(new Promise<string>((resolve) => { complete = resolve }))
    const { result } = renderCommand(request)
    let first!: Promise<string | undefined>
    await act(async () => {
      first = result.current.run({ value: 'same' })
      expect(await result.current.run({ value: 'same' })).toBeUndefined()
    })
    expect(request).toHaveBeenCalledTimes(1)
    await act(async () => { complete('saved'); await first })
  })
  it('does not update a new session or return a navigation result after logout', async () => {
    let complete!: (value: string) => void
    const request = vi.fn().mockReturnValue(new Promise<string>((resolve) => { complete = resolve }))
    const { result, queryClient } = renderCommand(request)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    let pending!: Promise<string | undefined>
    act(() => { pending = result.current.run({ value: 'same' }) })
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    act(() => { useAuthStore.getState().clearSession() })
    await act(async () => { complete('saved'); expect(await pending).toBeUndefined() })
    expect(invalidate).not.toHaveBeenCalled()
  })
  it('does not navigate or invalidate another screen after the originating page unmounts', async () => {
    let complete!: (value: string) => void
    const request = vi.fn().mockReturnValue(new Promise<string>((resolve) => { complete = resolve }))
    const { result, queryClient, unmount } = renderCommand(request)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    let pending!: Promise<string | undefined>
    act(() => { pending = result.current.run({ value: 'same' }) })
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    unmount()
    complete('saved')
    expect(await pending).toBeUndefined()
    expect(invalidate).not.toHaveBeenCalled()
  })
  it('uses a new command identity after definitive validation failure and corrected input', async () => {
    const request = vi.fn().mockRejectedValueOnce(new ApiError(422, 'Check input')).mockResolvedValueOnce('saved')
    const { result } = renderCommand(request)
    await act(async () => { await result.current.run({ value: 'invalid' }) })
    expect(result.current.uncertain).toBe(false)
    await act(async () => { await result.current.run({ value: 'corrected' }) })
    expect(request.mock.calls[0][1]).not.toBe(request.mock.calls[1][1])
  })
})
