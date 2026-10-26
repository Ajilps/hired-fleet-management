import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSessionResponse } from '../src/test/auth-fixtures'
import { createCompanyResponse, createOrderResponse, createTripResponse, orderListResponse, TEST_COMPANY_ID, TEST_ORDER_ID, TEST_TRIP_ID } from '../src/test/order-fixtures'
import { mockCurrentAdmin, mockEmptyOverview, openNavigation, signIn } from './auth-helpers'

async function openOrders(page: Page) {
  await page.goto('/login')
  await signIn(page)
  await page.getByRole('link', { name: 'View all orders', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await mockCurrentAdmin(page)
  await mockEmptyOverview(page)
  await page.route('**/api/v1/auth-sessions/login', (route) => route.fulfill({ json: createSessionResponse() }))
  await page.route('**/api/v1/companies?*', (route) => route.fulfill({ json: { items: [createCompanyResponse()], pageInfo: { totalCount: 1, hasMore: false, nextCursor: null } } }))
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}`, (route) => route.fulfill({ json: createCompanyResponse() }))
  await page.route('**/api/v1/orders?*', (route) => route.fulfill({ json: orderListResponse() }))
  await page.route(`**/api/v1/orders/${TEST_ORDER_ID}`, (route) => route.fulfill({ json: createOrderResponse(), headers: { ETag: '"order-v1"' } }))
})

test('filters the page, paginates cursors and restores the URL after detail navigation', async ({ page }, testInfo) => {
  const requests: URL[] = []
  const second = createOrderResponse('accepted', { id: '22222222-2222-4222-8222-222222222222' })
  await page.route('**/api/v1/orders?*', (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    return route.fulfill({ json: url.searchParams.has('cursor') ? orderListResponse([second], 26) : orderListResponse([createOrderResponse()], 26, 'opaque-page-2') })
  })
  await openOrders(page)
  await expect(page.getByRole('table')).toBeVisible()
  await page.getByLabel('Search current page').fill('airport')
  await page.getByLabel('Source · current page').selectOption('admin_phone')
  await page.getByLabel('Created from · IST').fill('2026-10-16')
  await page.getByLabel('Created through · IST').fill('2026-10-16')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page).toHaveURL(/search=airport/)
  await expect(page.getByRole('link', { name: TEST_ORDER_ID, exact: true })).toBeVisible()
  await expect.poll(() => requests.at(-1)?.searchParams.get('createdTo')).toBe('2026-10-17T00:00:00+05:30')
  expect(requests.at(-1)?.searchParams.has('source')).toBe(false)
  await page.getByRole('button', { name: 'Next →', exact: true }).click()
  await expect(page.getByRole('link', { name: second.id as string, exact: true })).toBeVisible()
  await expect(page).toHaveURL(/cursor=opaque-page-2/)
  await page.getByRole('button', { name: '← Previous', exact: true }).click()
  await expect(page.getByRole('link', { name: TEST_ORDER_ID, exact: true })).toBeVisible()
  await page.getByRole('link', { name: TEST_ORDER_ID, exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Order details' })).toBeVisible()
  await openNavigation(page)
  await expect(page.getByRole('link', { name: 'Orders', exact: true })).toHaveAttribute('aria-current', 'page')
  const close = page.getByRole('button', { name: 'Close navigation' })
  if (await close.isVisible()) await close.click()
  await page.getByRole('link', { name: '← Back to orders' }).click()
  await expect(page.getByLabel('Search current page')).toHaveValue('airport')
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('heading', { name: 'Orders', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('orders-desktop.png'), fullPage: true })
})

test('creates a received order then accepts with an exact amount and opens the Unassigned trip', async ({ page }, testInfo) => {
  let accepted = false
  await page.route(`**/api/v1/orders/${TEST_ORDER_ID}`, (route) => route.fulfill({ json: createOrderResponse(accepted ? 'accepted' : 'received'), headers: { ETag: accepted ? '"order-v2"' : '"order-v1"' } }))
  await page.route('**/api/v1/orders', async (route) => {
    const body = route.request().postDataJSON()
    expect(body.requestedPickupAt).toBe('2026-10-16T10:30:00+05:30')
    expect(body.source).toBe('admin_whatsapp')
    expect(body.companyId).toBe(TEST_COMPANY_ID)
    expect(route.request().headers()['idempotency-key']).toBeTruthy()
    expect(route.request().headers()['if-match']).toBeUndefined()
    await route.fulfill({ status: 201, json: createOrderResponse('received', { source: 'admin_whatsapp' }) })
  })
  await page.route(`**/api/v1/orders/${TEST_ORDER_ID}/accept`, (route) => {
    expect(route.request().postDataJSON()).toEqual({ totalAmount: '10000.00' })
    expect(route.request().headers()['if-match']).toBe('"order-v1"')
    accepted = true
    return route.fulfill({ json: { order: createOrderResponse('accepted'), trip: createTripResponse() }, headers: { ETag: '"order-v2"' } })
  })
  await page.route(`**/api/v1/trips/${TEST_TRIP_ID}`, (route) => route.fulfill({ json: createTripResponse() }))
  await openOrders(page)
  await page.getByRole('link', { name: 'Create order', exact: true }).click()
  await page.getByLabel('Company *').selectOption(TEST_COMPANY_ID)
  await page.getByLabel('Booking source *').selectOption('admin_whatsapp')
  await page.getByLabel('Pickup address *').fill('Indiranagar, Bengaluru')
  await page.getByLabel('Drop-off address *').fill('Kempegowda Airport')
  await page.getByLabel('Pickup date and time · IST *').fill('2026-10-16T10:30')
  await page.getByLabel('Contact name *').fill('Synthetic Contact')
  await page.getByLabel('Contact phone *').fill('+919800000000')
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.getByRole('heading', { name: 'Create order', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('create-order-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: 'Save order', exact: true }).click()
  await expect(page.getByText('Order saved as Received. Review it before accepting or rejecting.')).toBeVisible()
  await page.getByRole('heading', { name: 'Order details' }).click()
  await page.screenshot({ path: testInfo.outputPath('order-detail-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: 'Accept order', exact: true }).click()
  await page.getByLabel('Trip amount · INR *').fill('0.001')
  await page.getByRole('button', { name: 'Confirm acceptance' }).click()
  await expect(page.getByRole('alert')).toContainText('at most two decimal places')
  await page.getByLabel('Trip amount · INR *').fill('10000')
  await page.getByRole('button', { name: 'Confirm acceptance' }).click()
  await expect(page.getByText('Order accepted. An Unassigned trip was created; assign a driver separately.')).toBeVisible()
  await page.getByRole('link', { name: 'View resulting trip →' }).click()
  await expect(page).toHaveURL(new RegExp(`/trips/${TEST_TRIP_ID}$`))
  await expect(page.getByRole('heading', { name: 'Trip summary' })).toBeVisible()
  await expect(page.getByText('unassigned', { exact: true })).toBeVisible()
  await expect(page.getByText('₹10000.00', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 1100 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('trip-summary-mobile.png') })
})

test('rejects with a required reason in a distinct keyboard-accessible dialog', async ({ page }) => {
  let submissions = 0
  await page.route(`**/api/v1/orders/${TEST_ORDER_ID}/reject`, (route) => {
    submissions++
    expect(route.request().postDataJSON()).toEqual({ reason: 'No service capacity' })
    return route.fulfill({ json: createOrderResponse('rejected'), headers: { ETag: '"order-v2"' } })
  })
  await openOrders(page)
  await page.getByRole('link', { name: TEST_ORDER_ID, exact: true }).click()
  await page.getByRole('button', { name: 'Reject order', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Reject order with reason' })
  await expect(dialog).toBeVisible()
  await expect(page.getByLabel('Rejection reason *')).toBeFocused()
  await page.getByRole('button', { name: 'Confirm rejection' }).click()
  expect(submissions).toBe(0)
  await page.getByLabel('Rejection reason *').fill('   ')
  await page.getByRole('button', { name: 'Confirm rejection' }).click()
  await expect(page.getByRole('alert')).toContainText('rejection reason')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: 'Reject order', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Reject order', exact: true }).click()
  await page.getByLabel('Rejection reason *').fill('No service capacity')
  await page.getByRole('button', { name: 'Confirm rejection' }).click()
  await expect(page.getByText('Order rejected. The saved rejection reason is shown below.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Decision', exact: true }).getByText('No service capacity', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Accept order', exact: true })).toBeHidden()
})

test('refreshes after a concurrent decision and requires a new review', async ({ page }) => {
  let rejected = false
  let decisions = 0
  await page.route(`**/api/v1/orders/${TEST_ORDER_ID}`, (route) => route.fulfill({ json: createOrderResponse(rejected ? 'rejected' : 'received'), headers: { ETag: rejected ? '"order-v2"' : '"order-v1"' } }))
  await page.route(`**/api/v1/orders/${TEST_ORDER_ID}/accept`, (route) => {
    decisions++
    rejected = true
    return route.fulfill({ status: 412, json: { error: { code: 'STALE_VERSION' } } })
  })
  await openOrders(page)
  await page.getByRole('link', { name: TEST_ORDER_ID, exact: true }).click()
  await page.getByRole('button', { name: 'Accept order', exact: true }).click()
  await page.getByLabel('Trip amount · INR *').fill('100')
  await page.getByRole('button', { name: 'Confirm acceptance' }).click()
  await expect(page.getByRole('alert')).toContainText('Another change was saved first')
  await expect(page.getByRole('button', { name: 'Confirm acceptance' })).toBeDisabled()
  await page.getByRole('button', { name: 'Refresh current order' }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByText('No service capacity', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Accept order', exact: true })).toBeHidden()
  expect(decisions).toBe(1)
})

test('retries an interrupted decision with the same key, body and version and prevents duplicate submissions', async ({ page }) => {
  const commands: { key: string; body: string | null; etag: string }[] = []
  let release!: () => void
  const waiting = new Promise<void>((resolve) => { release = resolve })
  await page.route(`**/api/v1/orders/${TEST_ORDER_ID}/accept`, async (route) => {
    const request = route.request()
    commands.push({ key: request.headers()['idempotency-key'], body: request.postData(), etag: request.headers()['if-match'] })
    if (commands.length === 1) { await waiting; await route.abort('failed'); return }
    await route.fulfill({ json: { order: createOrderResponse('accepted'), trip: createTripResponse() }, headers: { ETag: '"order-v2"' } })
  })
  await openOrders(page)
  await page.getByRole('link', { name: TEST_ORDER_ID, exact: true }).click()
  await page.getByRole('button', { name: 'Accept order', exact: true }).click()
  await page.getByLabel('Trip amount · INR *').fill('10000')
  await page.getByRole('button', { name: 'Confirm acceptance' }).click()
  await expect(page.getByRole('button', { name: 'Saving decision…' })).toBeDisabled()
  await expect(page.getByLabel('Trip amount · INR *')).toBeDisabled()
  release()
  await expect(page.getByRole('button', { name: 'Retry same decision' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Retry same decision' }).click()
  await expect(page.getByRole('link', { name: 'View resulting trip →' })).toBeVisible()
  expect(commands).toHaveLength(2)
  expect(commands[0]).toEqual(commands[1])
})

test('preserves create input after a validation failure and respects retry guidance', async ({ page }) => {
  let attempts = 0
  await page.route('**/api/v1/orders', (route) => {
    attempts++
    return route.fulfill(attempts === 1 ? { status: 422, json: { error: {} } } : attempts === 2 ? { status: 429, headers: { 'Retry-After': '1' }, json: { error: { retryAfterSeconds: 90 } } } : { status: 201, json: createOrderResponse() })
  })
  await openOrders(page)
  await page.getByRole('link', { name: 'Create order', exact: true }).click()
  await page.getByLabel('Company *').selectOption(TEST_COMPANY_ID)
  await page.getByLabel('Pickup address *').fill('Indiranagar, Bengaluru')
  await page.getByLabel('Drop-off address *').fill('Kempegowda Airport')
  await page.getByLabel('Pickup date and time · IST *').fill('2026-10-16T10:30')
  await page.getByLabel('Contact name *').fill('Synthetic Contact')
  await page.getByLabel('Contact phone *').fill('+919800000000')
  await page.getByRole('button', { name: 'Save order', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Check the entered values')
  await expect(page.getByLabel('Pickup address *')).toHaveValue('Indiranagar, Bengaluru')
  await page.getByRole('button', { name: 'Save order', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Too many requests')
  await expect(page.getByRole('button', { name: 'Save order', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Save order', exact: true })).toBeEnabled({ timeout: 3000 })
  await page.getByRole('button', { name: 'Save order', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Order details' })).toBeVisible()
  expect(attempts).toBe(3)
})

test('recovers the list from failure to empty and rejects reversed date filters without a request', async ({ page }) => {
  let attempts = 0
  let unavailable = true
  await page.route('**/api/v1/orders?*', (route) => {
    if (new URL(route.request().url()).searchParams.get('limit') !== '25') return route.fulfill({ json: orderListResponse([]) })
    attempts++
    return route.fulfill(unavailable ? { status: 503, json: { error: {} } } : { json: orderListResponse([]) })
  })
  await openOrders(page)
  await expect(page.getByRole('alert')).toContainText('Unable to load your workspace')
  unavailable = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByText('No orders match these filters.', { exact: true })).toBeVisible()
  const completedAttempts = attempts
  await page.getByLabel('Created from · IST').fill('2026-10-17')
  await page.getByLabel('Created through · IST').fill('2026-10-16')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page.getByRole('alert')).toContainText('The end date must be on or after the start date.')
  expect(attempts).toBe(completedAttempts)
})
