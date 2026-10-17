import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { createAdminSession } from '../../../test/auth-fixtures'
import { activatedDriverResponse, ACTIVATION_DRIVER_ID } from '../../../test/driver-activation-fixtures'
import { allDriverDocuments, driverDocumentList, fileAssetResponse } from '../../../test/driver-document-fixtures'
import { pendingDriverResponse } from '../../../test/driver-fixtures'
import { createTestQueryClient } from '../../../test/query-clients'
import { useActivateDriver } from './use-driver-activation'

function renderCommand() {
  useAuthStore.getState().establishSession(createAdminSession())
  const queryClient = createTestQueryClient()
  function Wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> }
  return { queryClient, ...renderHook(() => useActivateDriver(ACTIVATION_DRIVER_ID), { wrapper: Wrapper }) }
}
function mockActivation(patch: (options: RequestInit) => Promise<Response> = async () => Response.json(activatedDriverResponse())) {
  const fetch = vi.fn(async (url: string, options: RequestInit) => {
    if (options.method === 'PATCH') return patch(options)
    if (url.includes('/documents?')) return Response.json(driverDocumentList(allDriverDocuments().map((document) => ({ ...document, driverId: ACTIVATION_DRIVER_ID }))))
    if (url.includes('/file-assets/')) return Response.json(fileAssetResponse({ id: url.split('/').at(-1) }))
    return Response.json(pendingDriverResponse())
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
describe('driver activation command lifecycle', () => {
  it('rechecks eligibility, normalizes the reason, updates only confirmed records and invalidates driver lists', async () => {
    const fetch = mockActivation()
    const { result, queryClient } = renderCommand()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    await act(async () => { expect(await result.current.run('  Operational onboarding complete  ')).toMatchObject({ status: 'active' }) })
    expect(fetch).toHaveBeenCalledTimes(7)
    expect(JSON.parse(fetch.mock.calls.at(-1)![1].body as string)).toEqual({ status: 'active', reason: 'Operational onboarding complete' })
    expect(queryClient.getQueryData(['driver', createAdminSession().user.email, ACTIVATION_DRIVER_ID])).toMatchObject({ status: 'active', isOnline: false })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['drivers', createAdminSession().user.email] })
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0))
  })
  it('replays an uncertain PATCH with identical body/key through in-progress and throttling without rechecking changed eligibility', async () => {
    const commands: RequestInit[] = []
    const fetch = mockActivation(async (options) => {
      commands.push(options)
      if (commands.length === 1) throw new TypeError('Synthetic interruption')
      if (commands.length === 2) return Response.json({ error: { code: 'COMMAND_IN_PROGRESS' } }, { status: 409 })
      if (commands.length === 3) return Response.json({ error: { retryAfterSeconds: 0 } }, { status: 429 })
      return Response.json(activatedDriverResponse())
    })
    const { result } = renderCommand()
    for (const reason of ['Original reason', 'Changed reason', 'Changed again']) {
      await act(async () => { await result.current.run(reason) })
      expect(result.current.uncertain).toBe(true)
      await waitFor(() => expect(result.current.delay).toBe(0))
    }
    await act(async () => { await result.current.run('Ignored on replay') })
    expect(result.current.uncertain).toBe(false)
    expect(fetch.mock.calls.filter(([, options]) => options.method !== 'PATCH')).toHaveLength(6)
    expect(new Set(commands.map((command) => command.body)).size).toBe(1)
    expect(new Set(commands.map((command) => (command.headers as Record<string, string>)['Idempotency-Key'])).size).toBe(1)
  })
  it('requires refreshed review after a definitive conflict and uses a new key', async () => {
    const commands: RequestInit[] = []
    mockActivation(async (options) => { commands.push(options); return commands.length === 1 ? Response.json({ error: {} }, { status: 409 }) : Response.json(activatedDriverResponse()) })
    const { result } = renderCommand()
    await act(async () => { await result.current.run('First reason') })
    expect(result.current.needsReview).toBe(true)
    await act(async () => { await result.current.run('Second reason') })
    expect(commands).toHaveLength(1)
    act(() => { result.current.completeReview() })
    await act(async () => { await result.current.run('Second reason') })
    expect(commands).toHaveLength(2)
    expect((commands[0].headers as Record<string, string>)['Idempotency-Key']).not.toBe((commands[1].headers as Record<string, string>)['Idempotency-Key'])
  })
  it('does not classify a failed preflight after definitive throttling as an unknown write', async () => {
    let failRead = false
    const fetch = mockActivation(async () => { failRead = true; return Response.json({ error: {} }, { status: 429 }) })
    const original = fetch.getMockImplementation()!
    fetch.mockImplementation(async (url: string, options: RequestInit) => failRead && options.method !== 'PATCH' ? Response.json({ error: {} }, { status: 503 }) : original(url, options))
    const { result } = renderCommand()
    await act(async () => { await result.current.run('Reason') })
    await act(async () => { await result.current.run('Reason') })
    expect(result.current.uncertain).toBe(false)
    expect(result.current.needsReview).toBe(true)
    expect(fetch.mock.calls.filter(([, options]) => options.method === 'PATCH')).toHaveLength(1)
  })
  it('blocks PATCH when the fresh account/documents are incomplete', async () => {
    const fetch = mockActivation()
    const original = fetch.getMockImplementation()!
    fetch.mockImplementation(async (url: string, options: RequestInit) => url.includes('/documents?') ? Response.json(driverDocumentList([])) : original(url, options))
    const { result } = renderCommand()
    await act(async () => { await result.current.run('Reason') })
    expect(result.current.uncertain).toBe(false)
    expect(result.current.error?.message).toContain('current upload missing')
    expect(fetch.mock.calls.some(([, options]) => options.method === 'PATCH')).toBe(false)
  })
  it('uses a synchronous duplicate guard while a PATCH is pending', async () => {
    let complete!: (response: Response) => void
    const patch = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { complete = resolve }))
    mockActivation(patch)
    const { result } = renderCommand()
    let pending!: ReturnType<typeof result.current.run>
    act(() => { pending = result.current.run('Reason') })
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    await act(async () => { await result.current.run('Duplicate reason') })
    expect(patch).toHaveBeenCalledTimes(1)
    await act(async () => { complete(Response.json(activatedDriverResponse())); await pending })
  })
  it.each(['unmount', 'logout', 'new-session'] as const)('ignores late success after %s without populating a different session', async (action) => {
    let complete!: (response: Response) => void
    mockActivation(async () => new Promise<Response>((resolve) => { complete = resolve }))
    const { result, queryClient, unmount } = renderCommand()
    let pending!: ReturnType<typeof result.current.run>
    act(() => { pending = result.current.run('Reason') })
    await waitFor(() => expect(complete).toBeTypeOf('function'))
    if (action === 'unmount') unmount()
    else act(() => { if (action === 'logout') useAuthStore.getState().clearSession(); else useAuthStore.getState().establishSession({ ...createAdminSession(), accessToken: 'new-session-token' }) })
    await act(async () => { complete(Response.json(activatedDriverResponse())); expect(await pending).toBeUndefined() })
    expect(queryClient.getQueryData(['driver', createAdminSession().user.email, ACTIVATION_DRIVER_ID])).toBeUndefined()
  })
  it('ignores an abandoned PATCH 401 after a newer session is established', async () => {
    let complete!: (response: Response) => void
    mockActivation(async () => new Promise<Response>((resolve) => { complete = resolve }))
    const { result } = renderCommand()
    let pending!: ReturnType<typeof result.current.run>
    act(() => { pending = result.current.run('Reason') })
    await waitFor(() => expect(complete).toBeTypeOf('function'))
    act(() => { useAuthStore.getState().establishSession({ ...createAdminSession(), accessToken: 'new-session-token' }) })
    await act(async () => { complete(Response.json({ error: {} }, { status: 401 })); await pending })
    expect(useAuthStore.getState().session?.accessToken).toBe('new-session-token')
  })
  it.each([401, 403])('handles PATCH status %s with the correct session boundary', async (status) => {
    mockActivation(async () => Response.json({ error: {} }, { status }))
    const { result, queryClient } = renderCommand()
    queryClient.setQueryData(['private-record'], { private: true })
    await act(async () => { await result.current.run('Reason') })
    expect(Boolean(useAuthStore.getState().session)).toBe(status === 403)
    expect(queryClient.getQueryData(['private-record'])).toEqual(status === 403 ? { private: true } : undefined)
  })
})
