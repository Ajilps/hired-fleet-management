import { describe, expect, it, vi } from 'vitest'
import { createSessionResponse } from '../../../test/auth-fixtures'
import { getCurrentAdmin } from './current-admin-service'

describe('current admin verification', () => {
  it.each([null, [], { role: 'admin', isActive: true }, { role: 'admin', isActive: true, fullName: 42, email: 'admin@example.test' }])('does not trust malformed user data: %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)))
    await expect(getCurrentAdmin('synthetic-access-token', new AbortController().signal)).rejects.toMatchObject({ status: expect.any(Number) })
  })

  it('reports a connection failure without silently logging out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network unavailable')))
    await expect(getCurrentAdmin('synthetic-access-token', new AbortController().signal)).rejects.toMatchObject({ status: 0 })
  })

  it('aborts requests when their consumer is cancelled', async () => {
    const consumer = new AbortController()
    let requestSignal!: AbortSignal
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, options: RequestInit) => {
      requestSignal = options.signal as AbortSignal
      return new Promise((_resolve, reject) => requestSignal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
    }))
    const request = getCurrentAdmin('synthetic-access-token', consumer.signal)
    consumer.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(requestSignal.aborted).toBe(true)
  })

  it('limits verification wait time and leaves retry available', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const request = expect(getCurrentAdmin('synthetic-access-token', new AbortController().signal)).rejects.toMatchObject({ status: 0 })
    await vi.advanceTimersByTimeAsync(15_000)
    await request
  })

  it('returns only the public identity fields from the current-user response', async () => {
    const user = createSessionResponse().user
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...user, internalNote: 'synthetic-private-field' })))
    await expect(getCurrentAdmin('synthetic-access-token', new AbortController().signal)).resolves.toEqual(user)
  })
})
