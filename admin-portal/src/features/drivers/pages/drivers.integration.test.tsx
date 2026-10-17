import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { createAdminSession, createSessionResponse } from '../../../test/auth-fixtures'
import { driverList, driverResponse, pendingDriverResponse, TEST_DRIVER_ID } from '../../../test/driver-fixtures'
import { renderApp } from '../../../test/render-app'

function mockDriverFetch(status = 200) {
  const fetch = vi.fn(async (input: string) => {
    if (input.includes('/users/me')) return Response.json(createSessionResponse().user)
    if (input.includes('/documents?')) return Response.json({ items: [], pageInfo: { totalCount: 0, hasMore: false, nextCursor: null } })
    return Response.json(status === 200 ? driverResponse() : { error: {} }, { status })
  })
  vi.stubGlobal('fetch', fetch)
  useAuthStore.getState().establishSession(createAdminSession())
  return fetch
}

describe('protected driver screens', () => {
  it.each(['/drivers', `/drivers/${TEST_DRIVER_ID}`])('blocks signed-out access to %s without fetching private records', async (path) => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    renderApp(path)
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeVisible()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('blocks invalid identities without requesting a driver', async () => {
    const fetch = mockDriverFetch()
    renderApp('/drivers/not-a-uuid')
    expect(await screen.findByRole('alert')).toHaveTextContent('This record is unavailable.')
    expect(fetch.mock.calls.every(([url]) => url.includes('/users/me'))).toBe(true)
  })
  it('preserves the session and hides private data for a resource-specific 403', async () => {
    mockDriverFetch(403)
    renderApp(`/drivers/${TEST_DRIVER_ID}`)
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have access')
    expect(useAuthStore.getState().session).not.toBeNull()
    expect(screen.queryByText(driverResponse().user.email)).not.toBeInTheDocument()
  })
  it('clears the session and cached driver records after a 401', async () => {
    mockDriverFetch(401)
    const { queryClient } = renderApp(`/drivers/${TEST_DRIVER_ID}`)
    queryClient.setQueryData(['drivers', createAdminSession().user.email, 'old'], driverList())
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await waitFor(() => expect(useAuthStore.getState().session).toBeNull())
    expect(queryClient.getQueryData(['drivers', createAdminSession().user.email, 'old'])).toBeUndefined()
  })
  it.each(['https://example.test', '//example.test', '/drivers/other', '/drivers#other', '/drivers?x=\\evil'])('rejects unsafe directory return %s', async (returnTo) => {
    mockDriverFetch()
    renderApp(`/drivers/${TEST_DRIVER_ID}?returnTo=${encodeURIComponent(returnTo)}`)
    expect(await screen.findByText(driverResponse().user.email)).toBeVisible()
    expect(screen.getByRole('link', { name: '← Back to drivers' })).toHaveAttribute('href', '/drivers')
  })
  it('shows authoritative pending details and missing information without activation controls', async () => {
    mockDriverFetch()
    const pending = pendingDriverResponse()
    vi.stubGlobal('fetch', vi.fn(async (input: string) => Response.json(input.includes('/users/me') ? createSessionResponse().user : input.includes('/documents?') ? { items: [], pageInfo: { totalCount: 0, hasMore: false, nextCursor: null } } : pending)))
    renderApp(`/drivers/${pending.id}?returnTo=${encodeURIComponent('/drivers?status=pending&search=Test')}`)
    expect(await screen.findByRole('heading', { name: 'Pending Applicant' })).toBeVisible()
    expect(screen.getByText('Pending application', { exact: false })).toBeVisible()
    expect(screen.getAllByText('Not provided')).toHaveLength(3)
    expect(screen.getByRole('link', { name: '← Back to drivers' })).toHaveAttribute('href', '/drivers?status=pending&search=Test')
    expect(screen.getByText('16 Oct 2026, 1:30 am')).toBeVisible()
    expect(screen.queryByRole('button', { name: /activate/i })).not.toBeInTheDocument()
  })
  it('defaults invalid URL filters to safe server values and filters search locally', async () => {
    const fetch = mockDriverFetch()
    fetch.mockImplementation(async (input: string) => Response.json(input.includes('/users/me') ? createSessionResponse().user : driverList([driverResponse()], 80)))
    const { user } = renderApp('/drivers?status=unknown&online=unknown')
    expect(await screen.findByRole('link', { name: 'View Test Driver' })).toBeVisible()
    await user.type(screen.getByLabelText('Search current page'), 'absent')
    expect(await screen.findByText('No drivers match the current-page search.')).toBeVisible()
    expect(screen.getByText(/0 shown from 1 loaded · 80 drivers/)).toBeVisible()
    expect(fetch.mock.calls.map(([url]) => url).filter((url) => url.includes('/drivers'))).toEqual(['/api/v1/drivers?limit=25&status=active'])
  })
})
