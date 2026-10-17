import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { createAdminSession } from '../../../test/auth-fixtures'
import { companyInput, companyResponse } from '../../../test/company-fixtures'
import { createTestQueryClient } from '../../../test/query-clients'
import { useCreateCompany } from './use-create-company'

function renderCommand() {
  useAuthStore.getState().establishSession(createAdminSession())
  const queryClient = createTestQueryClient()
  function Wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> }
  return { queryClient, ...renderHook(useCreateCompany, { wrapper: Wrapper }) }
}
describe('company creation lifecycle', () => {
  it('locks an interrupted command through throttling and replays its exact original body/key', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(Response.json({ error: {} }, { status: 429 })).mockResolvedValueOnce(Response.json(companyResponse(), { status: 201 }))
    vi.stubGlobal('fetch', fetch)
    const { result, queryClient } = renderCommand()
    await act(async () => { await result.current.run(companyInput()) })
    expect(result.current.isUncertain).toBe(true)
    await act(async () => { await result.current.run({ ...companyInput(), displayName: 'Changed' }) })
    expect(result.current.isUncertain).toBe(true)
    await act(async () => { expect(await result.current.run(null)).toEqual(companyResponse()) })
    expect(fetch.mock.calls.map((call) => call[1].body)).toEqual(Array(3).fill(JSON.stringify(companyInput())))
    const keys = fetch.mock.calls.map((call) => call[1].headers['Idempotency-Key'])
    expect(new Set(keys).size).toBe(1)
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0))
  })
  it('guards duplicate submission synchronously and invalidates company choices after success', async () => {
    let complete!: (response: Response) => void
    const fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { complete = resolve }))
    vi.stubGlobal('fetch', fetch)
    const { result, queryClient } = renderCommand()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    let pending!: ReturnType<typeof result.current.run>
    act(() => { pending = result.current.run(companyInput()) })
    await act(async () => { expect(await result.current.run(companyInput())).toBeUndefined() })
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => { complete(Response.json(companyResponse())); await pending })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['company-options', createAdminSession().user.email] })
    expect(queryClient.getQueryData(['company', createAdminSession().user.email, companyResponse().id])).toEqual(companyResponse())
  })
  it.each(['logout', 'unmount'])('ignores late results after %s', async (action) => {
    let complete!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => { complete = resolve })))
    const { result, queryClient, unmount } = renderCommand()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    let pending!: ReturnType<typeof result.current.run>
    act(() => { pending = result.current.run(companyInput()) })
    await waitFor(() => expect(complete).toBeTypeOf('function'))
    if (action === 'logout') act(() => { useAuthStore.getState().clearSession() })
    else unmount()
    await act(async () => { complete(Response.json(companyResponse())); expect(await pending).toBeUndefined() })
    expect(invalidate).not.toHaveBeenCalled()
  })
  it('uses a new key after definitive validation failure and correction', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ error: {} }, { status: 422 })).mockResolvedValueOnce(Response.json(companyResponse()))
    vi.stubGlobal('fetch', fetch)
    const { result } = renderCommand()
    await act(async () => { await result.current.run({ ...companyInput(), contactName: 'Old' }) })
    expect(result.current.isUncertain).toBe(false)
    await act(async () => { await result.current.run(companyInput()) })
    expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).not.toBe(fetch.mock.calls[1][1].headers['Idempotency-Key'])
  })
})
