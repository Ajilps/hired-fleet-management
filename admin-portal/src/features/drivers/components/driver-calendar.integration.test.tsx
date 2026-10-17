import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { createAdminSession, createSessionResponse } from '../../../test/auth-fixtures'
import { availabilityDateResponse, availabilityList } from '../../../test/driver-availability-fixtures'
import { driverList, driverResponse, TEST_DRIVER_ID } from '../../../test/driver-fixtures'
import { renderApp } from '../../../test/render-app'

function mockCalendar(status = 200) {
  useAuthStore.getState().establishSession(createAdminSession())
  const fetch = vi.fn(async (url: string) => {
    if (url.includes('/users/me')) return Response.json(createSessionResponse().user)
    if (url.includes('/documents?')) return Response.json(availabilityList([]))
    if (url.includes('/availability-dates?')) return Response.json(status === 200 ? availabilityList() : { error: {} }, { status })
    if (url.startsWith('/api/v1/drivers?')) return Response.json(driverList())
    return Response.json(driverResponse())
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
describe('calendar screen states', () => {
  it('shows selected date notes and distinguishes missing availability from unavailable', async () => {
    mockCalendar()
    const { user } = renderApp(`/drivers/${TEST_DRIVER_ID}?month=2026-10&day=2026-10-17`)
    expect(await screen.findByRole('heading', { name: '17 October 2026 · Available' })).toBeVisible()
    expect(screen.getByText('1 available · 0 unavailable · 30 not provided · October 2026')).toBeVisible()
    expect(screen.getByText('Note: Synthetic availability note')).toBeVisible()
    expect(screen.getByRole('region', { name: 'Selected calendar date' })).toHaveTextContent('17 Oct 2026, 1:30 am')
    await user.click(screen.getByRole('button', { name: '18 October 2026 · Not provided' }))
    expect(screen.getByRole('heading', { name: '18 October 2026 · Not provided' })).toBeVisible()
    expect(screen.getByText('No availability record was provided for this date.')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Set availability/i })).not.toBeInTheDocument()
  })
  it('blocks invalid month queries while retaining profile access and return navigation', async () => {
    const fetch = mockCalendar()
    renderApp(`/drivers/${TEST_DRIVER_ID}?month=2026-13&returnTo=${encodeURIComponent('/drivers?date=2026-10-17&search=Test')}`)
    expect(await screen.findByText('Choose a valid calendar month.')).toBeVisible()
    expect(screen.getByText('Synthetic address, Bengaluru')).toBeVisible()
    expect(fetch.mock.calls.some(([url]) => url.includes('/availability-dates?'))).toBe(false)
    expect(screen.getByRole('link', { name: '← Back to drivers' })).toHaveAttribute('href', '/drivers?date=2026-10-17&search=Test')
  })
  it('reports an invalid selected day without marking another date selected', async () => {
    mockCalendar()
    renderApp(`/drivers/${TEST_DRIVER_ID}?month=2026-10&day=2026-11-01`)
    expect(await screen.findByText('Choose a date within the selected calendar month.')).toBeVisible()
    expect(screen.queryByRole('button', { pressed: true })).not.toBeInTheDocument()
  })
  it('keeps resource-specific calendar denial independent of profile/documents', async () => {
    mockCalendar(403)
    renderApp(`/drivers/${TEST_DRIVER_ID}?month=2026-10`)
    const calendar = await screen.findByRole('region', { name: 'Availability calendar' })
    expect(await within(calendar).findByRole('alert')).toHaveTextContent('You do not have access')
    expect(screen.getByText('Synthetic address, Bengaluru')).toBeVisible()
    expect(useAuthStore.getState().session).not.toBeNull()
  })
  it('discards all private calendar data after an authenticated 401', async () => {
    mockCalendar(401)
    const { queryClient } = renderApp(`/drivers/${TEST_DRIVER_ID}?month=2026-10`)
    queryClient.setQueryData(['driver-availability', 'old-user'], [availabilityDateResponse()])
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await waitFor(() => expect(queryClient.getQueryData(['driver-availability', 'old-user'])).toBeUndefined())
  })
  it('blocks invalid directory dates and keeps search separate from calendar queries', async () => {
    const fetch = mockCalendar()
    renderApp('/drivers?date=2026-02-30')
    expect(await screen.findByRole('link', { name: 'View Test Driver' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a valid calendar date.')
    expect(fetch.mock.calls.some(([url]) => url.includes('/availability-dates?'))).toBe(false)
  })
})
