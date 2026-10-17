import { act, screen, waitFor, within } from '@testing-library/react'
import { onlineManager } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { createAdminSession, createSessionResponse } from '../../../test/auth-fixtures'
import { createOverviewList } from '../../../test/overview-fixtures'
import { renderApp } from '../../../test/render-app'

function startOverview(respond: (status: string) => Response | Promise<Response>) {
  useAuthStore.getState().establishSession(createAdminSession())
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/v1/users/me') return Promise.resolve(Response.json(createSessionResponse().user))
    const status = new URL(url, 'https://example.test').searchParams.get('status')!
    return Promise.resolve(respond(status))
  })
  vi.stubGlobal('fetch', fetchMock)
  return { ...renderApp('/overview'), fetchMock }
}

function metric(name: string) { return screen.getByRole('region', { name }) }

describe('operations overview', () => {
  it('keeps loading distinct from zero and prevents duplicate refreshes', async () => {
    const { fetchMock } = startOverview(() => new Promise<Response>(() => {}))
    expect(await screen.findByRole('heading', { name: 'Operations overview' })).toBeVisible()
    expect(within(metric('Orders awaiting decision')).getByText('Loading…')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled()
    expect(screen.queryByText('All caught up')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('shows all-range totals, previews and IST dates across midnight without treating all approvals as the current admin’s', async () => {
    startOverview((status) => Response.json(createOverviewList(status, 12)))
    expect(await within(await screen.findByRole('region', { name: 'Orders awaiting decision' })).findByText('12')).toBeVisible()
    const orders = screen.getByRole('region', { name: 'Incoming orders' })
    expect(within(orders).getByText('Showing 3 of 12 · Latest loaded summary')).toBeVisible()
    expect(within(orders).getAllByText('16 Oct 2026, 1:30 am IST')).toHaveLength(3)
    expect(screen.getAllByText('September 2026 statement')).toHaveLength(1)
    expect(screen.getByText('Each statement requires its creator’s approval and a distinct second admin’s approval.')).toBeVisible()
    expect(screen.getByText(/All companies · All dates/)).toBeVisible()
  })

  it('shows the overall empty state only after all four successful zero totals', async () => {
    startOverview((status) => Response.json(createOverviewList(status)))
    expect(await screen.findByText('All caught up')).toBeVisible()
    expect(within(metric('Orders awaiting decision')).getByText('0')).toBeVisible()
    expect(screen.getByText('No orders awaiting decision.')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('isolates a failed section and allows recovery through one explicit refresh', async () => {
    let failOrders = true
    const { user, fetchMock } = startOverview((status) => status === 'received' && failOrders
      ? Response.json({}, { status: 503 }) : Response.json(createOverviewList(status, status === 'ongoing' ? 8 : 0)))
    expect(await screen.findByRole('alert')).toHaveTextContent('Some summaries could not be refreshed.')
    expect(within(metric('Orders awaiting decision')).getByText('Unavailable')).toBeVisible()
    expect(within(metric('Ongoing trips')).getByText('8')).toBeVisible()
    expect(screen.queryByText('All caught up')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(5)
    failOrders = false
    await user.click(screen.getByRole('button', { name: 'Retry refresh' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(within(metric('Orders awaiting decision')).getByText('0')).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(9)
  })

  it('retains a failed refresh as explicitly stale data with its original update time', async () => {
    let failOrders = false
    const { user } = startOverview((status) => status === 'received' && failOrders
      ? Response.json({}, { status: 503 }) : Response.json(createOverviewList(status, 12)))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh overview' })).toBeEnabled())
    const originalTime = metric('Orders awaiting decision').querySelector('time')?.dateTime
    failOrders = true
    await user.click(screen.getByRole('button', { name: 'Refresh overview' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Previously loaded values are marked stale.')
    const orders = metric('Orders awaiting decision')
    expect(within(orders).getByText('12')).toBeVisible()
    expect(within(orders).getByText(/Stale ·/)).toBeVisible()
    expect(orders.querySelector('time')?.dateTime).toBe(originalTime)
  })

  it('marks cached summaries stale when their freshness window expires', async () => {
    const { queryClient } = startOverview((status) => Response.json(createOverviewList(status)))
    await screen.findByText('All caught up')
    act(() => {
      queryClient.setQueryData(['overview', 'admin@example.test', 'all-companies', 'orders'], { totalCount: 0, items: [] }, { updatedAt: Date.now() - 61_000 })
    })
    expect(await screen.findByText('Some summaries are over a minute old. Refresh for the latest operations.')).toBeVisible()
    expect(within(metric('Orders awaiting decision')).getByText(/Stale ·/)).toBeVisible()
    expect(screen.queryByText('All caught up')).not.toBeInTheDocument()
  })

  it('shows complete failure and recovers without a false empty state, including offline requests', async () => {
    onlineManager.setOnline(false)
    let fail = true
    const { user, fetchMock } = startOverview((status) => {
      if (fail) throw new TypeError('Synthetic offline failure')
      return Response.json(createOverviewList(status))
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to refresh operations.')
    expect(screen.getAllByText('Unavailable')).toHaveLength(4)
    expect(screen.queryByText('All caught up')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(5)
    fail = false
    onlineManager.setOnline(true)
    await user.click(screen.getByRole('button', { name: 'Retry refresh' }))
    expect(await screen.findByText('All caught up')).toBeVisible()
  })

  it('clears the session and overview cache when a summary returns 401', async () => {
    const { queryClient } = startOverview((status) => status === 'received' ? Response.json({}, { status: 401 }) : Response.json(createOverviewList(status, 3)))
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeVisible()
    expect(useAuthStore.getState().session).toBeNull()
    expect(queryClient.getQueriesData({ queryKey: ['overview'] })).toEqual([])
  })

  it('preserves the session on a summary-specific 403 and links to an existing section', async () => {
    const { user } = startOverview((status) => status === 'received' ? Response.json({}, { status: 403 }) : Response.json(createOverviewList(status)))
    await screen.findByRole('alert')
    expect(useAuthStore.getState().session).not.toBeNull()
    await user.click(screen.getByRole('link', { name: 'Open trips for assignment' }))
    expect(screen.getByRole('heading', { name: 'Trips' })).toBeVisible()
    expect(screen.getByRole('main')).toHaveFocus()
  })
})
