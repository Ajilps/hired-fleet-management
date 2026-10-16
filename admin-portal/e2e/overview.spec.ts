import { expect, test } from '@playwright/test'
import { createSessionResponse } from '../src/test/auth-fixtures'
import { createOverviewList } from '../src/test/overview-fixtures'
import { mockCurrentAdmin, mockEmptyCompanies, signIn } from './auth-helpers'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth-sessions/login', (route) => route.fulfill({ status: 200, json: createSessionResponse() }))
  await mockCurrentAdmin(page)
  await mockEmptyCompanies(page)
})

test('renders totals, record previews and attention at desktop, tablet and narrow widths', async ({ page }, testInfo) => {
  for (const path of ['orders', 'trips', 'statements']) {
    await page.route(`**/api/v1/${path}?*`, (route) => {
      const status = new URL(route.request().url()).searchParams.get('status')!
      expect(route.request().headers().authorization).toBe('Bearer synthetic-access-token')
      return route.fulfill({ json: createOverviewList(status, 12) })
    })
  }
  await page.goto('/login')
  await signIn(page)
  const orders = page.getByRole('region', { name: 'Orders awaiting decision', exact: true })
  await expect(orders.getByText('12', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Incoming orders' }).getByText('Showing 3 of 12 · Latest loaded summary')).toBeVisible()
  await expect(page.getByText('12 trips need a driver')).toBeVisible()
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('button', { name: 'Refresh overview' })).toHaveJSProperty('disabled', false)
    await expect(page.getByRole('link', { name: 'Review statements', exact: true })).toBeVisible()
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('heading', { name: 'Operations overview' }).click()
  await page.screenshot({ path: testInfo.outputPath('overview-desktop.png'), fullPage: true })
  // Capture a tall viewport to avoid installed Chrome's mobile full-page stitching artifacts.
  await page.setViewportSize({ width: 390, height: 3000 })
  await page.screenshot({ path: testInfo.outputPath('overview-mobile.png') })
  await page.getByRole('link', { name: 'View all orders', exact: true }).click()
  await expect(page).toHaveURL(/\/orders$/)
  await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible()
})

test('shows loading, unavailable, retry, empty and stale refresh feedback', async ({ page }) => {
  let failOrders = true
  let failAll = false
  let releaseOrders!: () => void
  const waiting = new Promise<void>((resolve) => { releaseOrders = resolve })
  for (const path of ['orders', 'trips', 'statements']) {
    await page.route(`**/api/v1/${path}?*`, async (route) => {
      const status = new URL(route.request().url()).searchParams.get('status')!
      if (status === 'received') await waiting
      return route.fulfill(failAll || (failOrders && status === 'received') ? { status: 503, json: { error: {} } } : { json: createOverviewList(status) })
    })
  }
  await page.goto('/login')
  await signIn(page)
  const orders = page.getByRole('region', { name: 'Orders awaiting decision', exact: true })
  await expect(orders.getByText('Loading…')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refreshing…' })).toBeDisabled()
  releaseOrders()
  await expect(orders.getByText('Unavailable')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Some summaries could not be refreshed.')
  failOrders = false
  await page.getByRole('button', { name: 'Retry refresh' }).click()
  await expect(page.getByText('All caught up', { exact: true })).toBeVisible()
  failAll = true
  await page.getByRole('button', { name: 'Refresh overview' }).click()
  await expect(page.getByRole('alert')).toContainText('Unable to refresh operations.')
  await expect(orders.getByText('0', { exact: true })).toBeVisible()
  await expect(orders.getByText(/Stale ·/)).toBeVisible()
  await expect(page.getByText('All caught up', { exact: true })).toBeHidden()
})
