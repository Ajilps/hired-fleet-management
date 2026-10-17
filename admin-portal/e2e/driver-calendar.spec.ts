import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSessionResponse } from '../src/test/auth-fixtures'
import { availabilityDateResponse, availabilityList } from '../src/test/driver-availability-fixtures'
import { driverList, driverResponse, SECOND_DRIVER_ID, TEST_DRIVER_ID } from '../src/test/driver-fixtures'
import { mockCurrentAdmin, mockEmptyOverview, openNavigation, signIn } from './auth-helpers'

function secondDriver() { return driverResponse({ id: SECOND_DRIVER_ID, user: { ...driverResponse().user, driverId: SECOND_DRIVER_ID, fullName: 'Second Driver', email: 'second@example.test' } }) }
function recordsFor(url: URL) {
  const records = url.pathname.includes(SECOND_DRIVER_ID)
    ? [availabilityDateResponse({ isAvailable: false, note: 'Second driver note' })]
    : [availabilityDateResponse({ note: 'First driver note' }), availabilityDateResponse({ availabilityDate: '2026-10-18', isAvailable: false, note: null })]
  return records.filter((entry) => entry.availabilityDate >= url.searchParams.get('fromDate')! && entry.availabilityDate < url.searchParams.get('toDate')!)
}
async function openDirectory(page: Page) {
  await page.goto('/login'); await signIn(page)
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  await openNavigation(page); await page.getByRole('link', { name: 'Drivers', exact: true }).click()
  await expect(page.getByRole('link', { name: 'View Test Driver', exact: true })).toBeVisible()
}
async function openProfile(page: Page) {
  await openDirectory(page)
  await page.getByRole('link', { name: 'View Test Driver', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Test Driver', exact: true })).toBeVisible()
}
async function checkWidths(page: Page) {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
}
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-16T18:30:00Z') })
  await mockCurrentAdmin(page); await mockEmptyOverview(page)
  await page.route('**/api/v1/auth-sessions/login', (route) => route.fulfill({ json: createSessionResponse() }))
  await page.route('**/api/v1/drivers?*', (route) => route.fulfill({ json: driverList([driverResponse(), secondDriver()]) }))
  await page.route(`**/api/v1/drivers/${TEST_DRIVER_ID}`, (route) => route.fulfill({ json: driverResponse() }))
  await page.route(`**/api/v1/drivers/${SECOND_DRIVER_ID}`, (route) => route.fulfill({ json: secondDriver() }))
  await page.route('**/api/v1/drivers/*/documents?*', (route) => route.fulfill({ json: availabilityList([]) }))
  await page.route('**/api/v1/drivers/*/availability-dates?*', (route) => route.fulfill({ json: availabilityList(recordsFor(new URL(route.request().url()))) }))
})

test('shows IST date snapshots, preserves the selected date through profile review and renders responsive month views', async ({ page }, testInfo) => {
  await openDirectory(page)
  await expect(page.getByLabel('Calendar date · IST')).toHaveValue('2026-10-17')
  const first = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'View Test Driver', exact: true }) })
  const second = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'View Second Driver', exact: true }) })
  await expect(first.getByText('Available', { exact: true })).toBeVisible()
  await expect(second.getByText('Unavailable', { exact: true })).toBeVisible()
  await page.getByLabel('Calendar date · IST').fill('2026-10-18')
  await expect(first.getByText('Unavailable', { exact: true })).toBeVisible()
  await expect(second.getByText('Not provided', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/date=2026-10-18/)
  await checkWidths(page)
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.screenshot({ path: testInfo.outputPath('driver-date-snapshots-desktop.png'), fullPage: true })
  await page.getByRole('link', { name: 'View Test Driver', exact: true }).click()
  const calendar = page.getByRole('region', { name: 'Availability calendar', exact: true })
  await expect(calendar.getByRole('heading', { name: '18 October 2026 · Unavailable' })).toBeVisible()
  await expect(calendar.getByText('1 available · 1 unavailable · 29 not provided · October 2026', { exact: true })).toBeVisible()
  await calendar.getByRole('button', { name: '17 October 2026 · Available', exact: true }).click()
  await expect(calendar.getByText('Note: First driver note', { exact: true })).toBeVisible()
  await expect(calendar.getByRole('region', { name: 'Selected calendar date' })).toContainText('17 Oct 2026, 1:30 am')
  await calendar.getByRole('button', { name: '19 October 2026 · Not provided', exact: true }).click()
  await expect(calendar.getByText('No availability record was provided for this date.', { exact: true })).toBeVisible()
  await checkWidths(page)
  await page.setViewportSize({ width: 1440, height: 1100 })
  await calendar.screenshot({ path: testInfo.outputPath('availability-calendar-desktop.png') })
  await page.setViewportSize({ width: 390, height: 1100 })
  await calendar.screenshot({ path: testInfo.outputPath('availability-calendar-mobile.png') })
  await calendar.getByRole('button', { name: 'Next month →', exact: true }).click()
  await expect(page.getByLabel('Calendar month · IST')).toHaveValue('2026-11')
  await expect(calendar.getByText('0 available · 0 unavailable · 30 not provided · November 2026', { exact: true })).toBeVisible()
  await expect(page).not.toHaveURL(/day=/)
  await calendar.getByRole('button', { name: '← Previous month', exact: true }).click()
  await expect(page.getByLabel('Calendar month · IST')).toHaveValue('2026-10')
  await page.getByRole('link', { name: '← Back to drivers' }).click()
  await expect(page.getByLabel('Calendar date · IST')).toHaveValue('2026-10-18')
})

test('finishes pagination before showing unrecorded days, retains stale calendar data and recovers to an empty month', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let fail = false
  let empty = false
  await page.route('**/api/v1/drivers/*/availability-dates?*', async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('fromDate') !== '2026-10-01') return route.fulfill({ json: availabilityList(recordsFor(url)) })
    if (empty) return route.fulfill({ json: availabilityList([]) })
    if (url.searchParams.has('cursor')) { await gate; return route.fulfill(fail ? { status: 503, json: { error: {} } } : { json: availabilityList([availabilityDateResponse({ availabilityDate: '2026-10-18', isAvailable: false })], 2) }) }
    return route.fulfill({ json: availabilityList([availabilityDateResponse()], 2, 'opaque/page-2') })
  })
  await openProfile(page)
  const calendar = page.getByRole('region', { name: 'Availability calendar', exact: true })
  await expect(calendar.getByText('Loading availability calendar…', { exact: true })).toBeVisible()
  await expect(calendar.getByRole('button', { name: '19 October 2026 · Not provided', exact: true })).toHaveCount(0)
  release()
  await expect(calendar.getByText('1 available · 1 unavailable · 29 not provided · October 2026', { exact: true })).toBeVisible()
  fail = true
  await calendar.getByRole('button', { name: 'Refresh calendar', exact: true }).click()
  await expect(calendar.getByRole('alert')).toBeVisible()
  await expect(calendar.getByText('This calendar is from the previous successful load and may be stale.', { exact: true })).toBeVisible()
  await expect(calendar.getByRole('button', { name: '17 October 2026 · Available', exact: true })).toBeVisible()
  fail = false; empty = true
  await calendar.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(calendar.getByText('0 available · 0 unavailable · 31 not provided · October 2026', { exact: true })).toBeVisible()
  await expect(page.getByText('Synthetic address, Bengaluru', { exact: true })).toBeVisible()
})

test('keeps calendar denial independent of profile access, honors throttling and clears session on calendar 401', async ({ page }) => {
  let status = 403
  await page.route('**/api/v1/drivers/*/availability-dates?*', (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('fromDate') !== '2026-10-01') return route.fulfill({ json: availabilityList(recordsFor(url)) })
    return route.fulfill(status === 200 ? { json: availabilityList([]) } : { status, headers: { 'Retry-After': '1' }, json: { error: {} } })
  })
  await openProfile(page)
  const calendar = page.getByRole('region', { name: 'Availability calendar', exact: true })
  await expect(calendar.getByRole('alert')).toContainText('You do not have access')
  await expect(page.getByText('Synthetic address, Bengaluru', { exact: true })).toBeVisible()
  status = 429
  await calendar.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(calendar.getByRole('alert')).toContainText('Too many requests')
  await expect(calendar.getByRole('button', { name: 'Refresh calendar', exact: true })).toBeDisabled()
  await expect(calendar.getByRole('button', { name: 'Try again', exact: true })).toBeDisabled()
  status = 200
  await expect(calendar.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled({ timeout: 3000 })
  await calendar.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(calendar.getByText('0 available · 0 unavailable · 31 not provided · October 2026', { exact: true })).toBeVisible()
  status = 401
  await calendar.getByRole('button', { name: 'Refresh calendar', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('region', { name: 'Availability calendar', exact: true })).toHaveCount(0)
})

test('ignores a late calendar response after switching months', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let requested = false
  await page.route('**/api/v1/drivers/*/availability-dates?*', async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('fromDate') === '2026-11-01') { requested = true; await gate; await route.fulfill({ json: availabilityList([availabilityDateResponse({ availabilityDate: '2026-11-01', note: 'Old month note' })]) }).catch(() => undefined); return }
    if (url.searchParams.get('fromDate') === '2026-12-01') return route.fulfill({ json: availabilityList([availabilityDateResponse({ availabilityDate: '2026-12-01', note: 'New month note' })]) })
    return route.fulfill({ json: availabilityList(recordsFor(url)) })
  })
  await openProfile(page)
  const calendar = page.getByRole('region', { name: 'Availability calendar', exact: true })
  await expect(calendar.getByRole('button', { name: '17 October 2026 · Available', exact: true })).toBeVisible()
  await calendar.getByRole('button', { name: 'Next month →', exact: true }).click()
  await expect.poll(() => requested).toBe(true)
  await expect(calendar.getByText('Loading availability calendar…', { exact: true })).toBeVisible()
  await expect(calendar.getByRole('button', { name: '17 October 2026 · Available', exact: true })).toHaveCount(0)
  await calendar.getByRole('button', { name: 'Next month →', exact: true }).click()
  await expect(calendar.getByText('Note: New month note', { exact: true })).toBeVisible()
  release()
  await expect(page.getByLabel('Calendar month · IST')).toHaveValue('2026-12')
  await expect(calendar.getByText('Old month note', { exact: false })).toHaveCount(0)
})

test('isolates driver calendars and keeps a pending driver ineligible even when a day is available', async ({ page }) => {
  await openProfile(page)
  let calendar = page.getByRole('region', { name: 'Availability calendar', exact: true })
  await expect(calendar.getByText('Note: First driver note', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '← Back to drivers' }).click()
  await page.getByRole('link', { name: 'View Second Driver', exact: true }).click()
  calendar = page.getByRole('region', { name: 'Availability calendar', exact: true })
  await expect(calendar.getByText('Note: Second driver note', { exact: true })).toBeVisible()
  await expect(calendar.getByRole('heading', { name: '17 October 2026 · Unavailable' })).toBeVisible()
  await expect(calendar.getByText('First driver note', { exact: false })).toHaveCount(0)
  await page.getByRole('link', { name: '← Back to drivers' }).click()
  await page.getByRole('link', { name: 'View Test Driver', exact: true }).click()
  await page.route(`**/api/v1/drivers/${TEST_DRIVER_ID}`, (route) => route.fulfill({ json: driverResponse({ status: 'pending' }) }))
  await page.getByRole('button', { name: 'Refresh driver', exact: true }).click()
  await expect(calendar.getByText('This driver is not eligible for assignment: an active driver profile and enabled user account are both required.', { exact: true })).toBeVisible()
  await expect(calendar.getByRole('heading', { name: '17 October 2026 · Available' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Activate driver', exact: true })).toBeDisabled()
})

test('recovers individual directory calendars without hiding other drivers or inventing missing records', async ({ page }) => {
  let status = 404
  await page.route(`**/api/v1/drivers/${TEST_DRIVER_ID}/availability-dates?*`, (route) => route.fulfill(status === 200 ? { json: availabilityList() } : { status, json: { error: {} } }))
  await openDirectory(page)
  const first = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'View Test Driver', exact: true }) })
  const second = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'View Second Driver', exact: true }) })
  await expect(first.getByRole('alert')).toContainText('This record is unavailable.')
  await expect(first.getByText('Not provided', { exact: true })).toHaveCount(0)
  await expect(second.getByText('Unavailable', { exact: true })).toBeVisible()
  status = 200
  await first.getByRole('button', { name: 'Retry calendar for Test Driver', exact: true }).click()
  await expect(first.getByText('Available', { exact: true })).toBeVisible()
  status = 503
  await first.getByRole('button', { name: 'Refresh calendar for Test Driver', exact: true }).click()
  await expect(first.getByText('Stale calendar data', { exact: true })).toBeVisible()
  await expect(first.getByText('Available', { exact: true })).toBeVisible()
})

test('preserves directory cursor/search state when changing the calendar date and sends only documented server filters', async ({ page }) => {
  let listCalls = 0
  const urls: URL[] = []
  await page.route('**/api/v1/drivers?*', (route) => {
    listCalls++
    const url = new URL(route.request().url()); urls.push(url)
    return route.fulfill({ json: url.searchParams.has('cursor') ? driverList([secondDriver()], 26) : driverList([driverResponse()], 26, 'opaque/page-2') })
  })
  await openDirectory(page)
  await page.getByRole('button', { name: 'Next →', exact: true }).click()
  await expect(page.getByRole('link', { name: 'View Second Driver', exact: true })).toBeVisible()
  await page.getByLabel('Search current page').fill('Second')
  const before = listCalls
  await page.getByLabel('Calendar date · IST').fill('2026-10-18')
  await expect(page.getByText('Not provided', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/cursor=opaque%2Fpage-2/)
  await expect(page.getByLabel('Search current page')).toHaveValue('Second')
  expect(listCalls).toBe(before)
  expect([...urls.at(-1)!.searchParams.keys()]).toEqual(['limit', 'status', 'cursor'])
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(page.getByLabel('Calendar date · IST')).toHaveValue('2026-10-17')
  await expect(page).toHaveURL(/cursor=opaque%2Fpage-2/)
})
