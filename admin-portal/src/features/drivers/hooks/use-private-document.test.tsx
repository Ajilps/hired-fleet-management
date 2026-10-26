import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { createAdminSession } from '../../../test/auth-fixtures'
import { downloadLinkResponse, fileAssetResponse, syntheticPng, TEST_ASSET_ID, TEST_PRIVATE_URL } from '../../../test/driver-document-fixtures'
import { createTestQueryClient } from '../../../test/query-clients'
import { usePrivateDocument } from './use-private-document'

function renderPreview() {
  useAuthStore.getState().establishSession(createAdminSession())
  const queryClient = createTestQueryClient()
  const createUrl = vi.fn().mockReturnValue('blob:synthetic-preview')
  const revokeUrl = vi.fn()
  vi.stubGlobal('URL', class extends URL { static createObjectURL = createUrl; static revokeObjectURL = revokeUrl })
  function Wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> }
  return { queryClient, createUrl, revokeUrl, ...renderHook(() => usePrivateDocument(TEST_ASSET_ID), { wrapper: Wrapper }) }
}
function mockSuccessfulPreview(expiresAt?: string) {
  const fetch = vi.fn(async (url: string) => {
    if (url.includes('/download-links')) return Response.json(downloadLinkResponse(expiresAt ? { expiresAt } : {}))
    if (url.startsWith('https:')) return new Response(syntheticPng(), { headers: { 'Content-Type': 'image/png' } })
    return Response.json(fileAssetResponse())
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
describe('private preview lifecycle', () => {
  it('keeps signed URLs and file bytes outside query/mutation caches and revokes the blob on close', async () => {
    mockSuccessfulPreview()
    const { result, queryClient, revokeUrl, unmount } = renderPreview()
    await act(async () => { await result.current.run() })
    expect(result.current.preview?.url).toBe('blob:synthetic-preview')
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0))
    const cache = JSON.stringify(queryClient.getQueryCache().getAll().map((query) => query.state))
    expect(cache).not.toContain(TEST_PRIVATE_URL)
    expect(cache).not.toContain('blob:')
    unmount()
    expect(revokeUrl).toHaveBeenCalledWith('blob:synthetic-preview')
  })
  it('removes loaded content when the signed link expires and requires a fresh explicit request', async () => {
    vi.useFakeTimers()
    mockSuccessfulPreview(new Date(Date.now() + 1000).toISOString())
    const { result, revokeUrl } = renderPreview()
    await act(async () => { await result.current.run() })
    expect(result.current.preview).not.toBeNull()
    await act(async () => { vi.advanceTimersByTime(1001) })
    expect(result.current.preview).toBeNull()
    expect(result.current.error?.message).toContain('expired')
    expect(revokeUrl).toHaveBeenCalledWith('blob:synthetic-preview')
  })
  it('discards duplicate clicks while loading and never stores link/byte results in mutations', async () => {
    let complete!: (response: Response) => void
    const fetch = mockSuccessfulPreview()
    fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { complete = resolve }))
    const { result, queryClient } = renderPreview()
    let pending!: Promise<void>
    act(() => { pending = result.current.run() })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    await act(async () => { await result.current.run() })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(queryClient.getMutationCache().getAll()[0].state.variables).toBeUndefined()
    await act(async () => { complete(Response.json(fileAssetResponse())); await pending })
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0))
  })
  it.each(['unmount', 'logout', 'new-session'] as const)('aborts and ignores late file data after %s', async (action) => {
    let complete!: (response: Response) => void
    const fetch = mockSuccessfulPreview()
    fetch.mockImplementation(async (url: string) => url.startsWith('https:') ? new Promise<Response>((resolve) => { complete = resolve }) : Response.json(url.includes('/download-links') ? downloadLinkResponse() : fileAssetResponse()))
    const { result, createUrl, unmount } = renderPreview()
    let pending!: Promise<void>
    act(() => { pending = result.current.run() })
    await waitFor(() => expect(complete).toBeTypeOf('function'))
    if (action === 'unmount') unmount()
    else act(() => { if (action === 'logout') useAuthStore.getState().clearSession(); else useAuthStore.getState().establishSession({ ...createAdminSession(), accessToken: 'new-session-token' }) })
    await act(async () => { complete(new Response(syntheticPng(), { headers: { 'Content-Type': 'image/png' } })); await pending })
    expect(createUrl).not.toHaveBeenCalled()
  })
  it('does not let a late API 401 from an abandoned request clear a later session', async () => {
    let complete!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => { complete = resolve })))
    const { result } = renderPreview()
    let pending!: Promise<void>
    act(() => { pending = result.current.run() })
    await waitFor(() => expect(complete).toBeTypeOf('function'))
    act(() => { useAuthStore.getState().establishSession({ ...createAdminSession(), accessToken: 'new-session-token' }) })
    await act(async () => { complete(Response.json({ error: {} }, { status: 401 })); await pending })
    expect(useAuthStore.getState().session?.accessToken).toBe('new-session-token')
  })
  it.each([401, 403])('handles authenticated preview status %s with the correct session boundary', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: {} }, { status })))
    const { result, queryClient } = renderPreview()
    queryClient.setQueryData(['private-record'], { private: true })
    await act(async () => { await result.current.run() })
    expect(Boolean(useAuthStore.getState().session)).toBe(status === 403)
    expect(queryClient.getQueryData(['private-record'])).toEqual(status === 403 ? { private: true } : undefined)
  })
  it('revokes content on render failure and keeps a recoverable error', async () => {
    mockSuccessfulPreview()
    const { result, revokeUrl } = renderPreview()
    await act(async () => { await result.current.run() })
    act(() => { result.current.handleRenderFailure() })
    expect(result.current.preview).toBeNull()
    expect(result.current.error?.message).toContain('could not be displayed')
    expect(revokeUrl).toHaveBeenCalledWith('blob:synthetic-preview')
  })
})
