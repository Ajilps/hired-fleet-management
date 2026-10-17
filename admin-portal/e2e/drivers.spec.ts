import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSessionResponse } from '../src/test/auth-fixtures'
import { driverList, driverResponse, pendingDriverResponse, TEST_DRIVER_ID } from '../src/test/driver-fixtures'
import { mockCurrentAdmin, mockEmptyOverview, openNavigation, signIn } from './auth-helpers'

async function openDrivers(page: Page) {
  await page.goto('/login')
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  await openNavigation(page)
  await page.getByRole('link', { name: 'Drivers', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Drivers', exact: true })).toBeVisible()
}
async function checkWidths(page: Page) {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
}
test.beforeEach(async ({ page }) => {
  await mockCurrentAdmin(page)
  await mockEmptyOverview(page)
  await page.route('**/api/v1/auth-sessions/login', (route) => route.fulfill({ json: createSessionResponse() }))
  await page.route('**/api/v1/drivers?*', (route) => route.fulfill({ json: driverList() }))
  await page.route('**/api/v1/drivers/*/documents?*', (route) => route.fulfill({ json: { items: [], pageInfo: { totalCount: 0, hasMore: false, nextCursor: null } } }))
  await page.route(`**/api/v1/drivers/${TEST_DRIVER_ID}`, (route) => route.fulfill({ json: driverResponse() }))
  await page.route(`**/api/v1/drivers/${pendingDriverResponse().id}`, (route) => route.fulfill({ json: pendingDriverResponse() }))
})

test('paginates, preserves search/return navigation and resets cursors for server filters', async ({ page }, testInfo) => {
  const requests: URL[] = []
  const second = driverResponse({ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', user: { ...driverResponse().user, driverId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', fullName: 'Another Driver' } })
  await page.route('**/api/v1/drivers?*', (route) => {
    const url = new URL(route.request().url()); requests.push(url)
    const status = url.searchParams.get('status')
    if (status === 'pending') return route.fulfill({ json: driverList([pendingDriverResponse()]) })
    if (url.searchParams.get('isOnline') === 'true') return route.fulfill({ json: driverList([driverResponse({ isOnline: true })]) })
    return route.fulfill({ json: url.searchParams.has('cursor') ? driverList([second], 26) : driverList([driverResponse()], 26, 'opaque/page-2') })
  })
  await openDrivers(page)
  await expect(page.getByRole('button', { name: 'Active', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Search current page').fill('Test Driver')
  await expect(page.getByText(/1 shown from 1 loaded · 26 drivers/)).toBeVisible()
  await page.getByRole('link', { name: 'View Test Driver' }).click()
  await expect(page.getByRole('heading', { name: 'Test Driver', exact: true })).toBeVisible()
  await expect(page.getByText('Synthetic address, Bengaluru', { exact: true })).toBeVisible()
  await expect(page.getByText('28 Feb 1995', { exact: true })).toBeVisible()
  await expect(page.getByText('16 Oct 2026, 1:30 am', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '← Back to drivers' }).click()
  await expect(page.getByLabel('Search current page')).toHaveValue('Test Driver')
  await page.getByRole('button', { name: 'Next →', exact: true }).click()
  await expect(page.getByText('No drivers match the current-page search.', { exact: true })).toBeVisible()
  await expect.poll(() => requests.at(-1)?.searchParams.get('cursor')).toBe('opaque/page-2')
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByRole('link', { name: 'View Another Driver' })).toBeVisible()
  await page.getByRole('button', { name: '← Previous', exact: true }).click()
  await expect(page.getByRole('link', { name: 'View Test Driver' })).toBeVisible()
  await page.getByRole('button', { name: 'Next →', exact: true }).click()
  await expect(page.getByRole('link', { name: 'View Another Driver' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Online status', exact: true }).selectOption('true')
  await expect(page.getByRole('link', { name: 'View Test Driver' })).toBeVisible()
  await expect(page).not.toHaveURL(/cursor=/)
  await expect.poll(() => requests.at(-1)?.searchParams.get('isOnline')).toBe('true')
  await page.getByRole('combobox', { name: 'Online status', exact: true }).selectOption('')
  await page.getByRole('button', { name: 'Pending', exact: true }).click()
  await expect(page.getByRole('link', { name: 'View Pending Applicant' })).toBeVisible()
  expect([...requests.at(-1)!.searchParams.keys()]).toEqual(['limit', 'status'])
  await checkWidths(page)
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.screenshot({ path: testInfo.outputPath('drivers-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 1500 })
  await page.screenshot({ path: testInfo.outputPath('drivers-mobile.png') })
  await page.getByRole('link', { name: 'View Pending Applicant' }).click()
  await expect(page.getByRole('heading', { name: 'Pending Applicant', exact: true })).toBeVisible()
  await expect(page.getByText('Not provided', { exact: true })).toHaveCount(3)
  await expect(page.getByText('Not recorded', { exact: true })).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Activate driver', exact: true })).toBeDisabled()
  await checkWidths(page)
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.screenshot({ path: testInfo.outputPath('driver-detail-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 1700 })
  await page.screenshot({ path: testInfo.outputPath('driver-detail-mobile.png') })
  await page.getByRole('link', { name: '← Back to drivers' }).click()
  await expect(page.getByRole('button', { name: 'Pending', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('recovers from loading, stale list failure and empty results', async ({ page }) => {
  let fail = false
  let empty = false
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/v1/drivers?*', async (route) => {
    await gate
    await route.fulfill(fail ? { status: 503, json: { error: {} } } : { json: empty ? driverList([]) : driverList() })
  })
  await openDrivers(page)
  await expect(page.getByText('Loading drivers…', { exact: true })).toBeVisible()
  release()
  await expect(page.getByRole('link', { name: 'View Test Driver' })).toBeVisible()
  fail = true
  await page.getByRole('button', { name: 'Refresh drivers', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('These driver records are from the previous successful load and may be stale.', { exact: true })).toBeVisible()
  fail = false; empty = true
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByText('No drivers on this page for the selected filters.', { exact: true })).toBeVisible()
  empty = false
  await page.getByRole('button', { name: 'Refresh drivers', exact: true }).click()
  await expect(page.getByRole('link', { name: 'View Test Driver' })).toBeVisible()
})

test('keeps profile data explicitly stale after refresh failures and honors retry delays', async ({ page }) => {
  let responseStatus = 200
  let requests = 0
  await page.route(`**/api/v1/drivers/${TEST_DRIVER_ID}`, (route) => {
    requests++
    return route.fulfill(responseStatus === 200 ? { json: driverResponse() } : { status: responseStatus, headers: { 'Retry-After': '2' }, json: { error: {} } })
  })
  await openDrivers(page)
  await page.getByRole('link', { name: 'View Test Driver' }).click()
  await expect(page.getByRole('heading', { name: 'Test Driver', exact: true })).toBeVisible()
  const initialRequests = requests
  responseStatus = 429
  await page.getByRole('button', { name: 'Refresh driver', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Too many requests')
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Refresh driver', exact: true })).toBeDisabled()
  await expect(page.getByText('This driver profile is from the previous successful load and may be stale.', { exact: true })).toBeVisible()
  expect(requests).toBe(initialRequests + 1)
  responseStatus = 200
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled({ timeout: 4000 })
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(requests).toBe(initialRequests + 2)
})

test('handles unavailable and forbidden details, rejects malformed records and clears session on 401', async ({ page }) => {
  let responseStatus = 404
  let malformed = false
  await page.route(`**/api/v1/drivers/${TEST_DRIVER_ID}`, (route) => route.fulfill({ status: responseStatus, json: responseStatus === 200 ? driverResponse({ status: malformed ? 'invalid' : 'active' }) : { error: {} } }))
  await openDrivers(page)
  await page.getByRole('link', { name: 'View Test Driver' }).click()
  await expect(page.getByRole('alert')).toContainText('This record is unavailable.')
  responseStatus = 403
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('You do not have access')
  await expect(page.getByRole('heading', { name: 'Driver details', exact: true })).toBeVisible()
  responseStatus = 200; malformed = true
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('unexpected response')
  await expect(page.getByText('driver@example.test', { exact: true })).toHaveCount(0)
  malformed = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByText('driver@example.test', { exact: true })).toBeVisible()
  responseStatus = 401
  await page.getByRole('button', { name: 'Refresh driver', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('Your session expired', { exact: true })).toBeVisible()
  await expect(page.getByText('driver@example.test', { exact: true })).toHaveCount(0)
})

test('supports inactive and suspended directory records without confusing account and operational status', async ({ page }) => {
  await page.route('**/api/v1/drivers?*', (route) => {
    const status = new URL(route.request().url()).searchParams.get('status')!
    return route.fulfill({ json: driverList([driverResponse({ status, user: { ...driverResponse().user, isActive: status !== 'suspended' } })]) })
  })
  await openDrivers(page)
  await page.getByRole('button', { name: 'Inactive', exact: true }).click()
  await expect(page.getByText('Enabled', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Suspended', exact: true }).click()
  await expect(page.getByText('Disabled', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/status=suspended/)
})
