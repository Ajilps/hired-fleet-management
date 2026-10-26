import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSessionResponse, TEST_PASSWORD } from '../src/test/auth-fixtures'
import { mockEmptyOverview } from './auth-helpers'

const email = `${'a'.repeat(60)}@example.test`
const nextPassword = 'synthetic-new-password-for-admin'
async function enter(page: Page) {
  await page.goto('/login'); await page.getByLabel('Email address').fill(email); await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Change your password' })).toBeVisible()
}
async function fill(page: Page) {
  await page.getByLabel('Current password', { exact: true }).fill(TEST_PASSWORD)
  await page.getByLabel('New password', { exact: true }).fill(nextPassword)
  await page.getByLabel('Confirm new password', { exact: true }).fill(nextPassword)
}
test.beforeEach(async ({ page }) => {
  let signedIn = false; let required = true
  const body = () => { const response = createSessionResponse({ transport: 'browser' }); return { ...response, user: { ...response.user, email, passwordChangeRequired: required } } }
  await mockEmptyOverview(page)
  await page.route('**/api/v1/auth-sessions/login', (route) => { signedIn = true; return route.fulfill({ json: body() }) })
  await page.route('**/api/v1/auth-sessions/refresh', (route) => signedIn ? route.fulfill({ json: body() }) : route.fulfill({ status: 401, json: { error: {} } }))
  await page.route('**/api/v1/auth-sessions/logout', (route) => { signedIn = false; return route.fulfill({ status: 204 }) })
  await page.route('**/api/v1/users/me', (route) => route.fulfill({ json: body().user }))
  await page.route('**/api/v1/users/me/password', (route) => { required = false; signedIn = false; return route.fulfill({ status: 204 }) })
})

test('gates workspace/reload, validates matching passwords and requires fresh sign-in after change', async ({ page }, testInfo) => {
  let businessRequests = 0
  page.on('request', (request) => { if (/\/(orders|trips|statements)\?/.test(request.url())) businessRequests++ })
  await enter(page); await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden()
  await page.goto('/orders'); await expect(page.getByRole('heading', { name: 'Change your password' })).toBeVisible()
  expect(businessRequests).toBe(0)
  await page.getByRole('button', { name: 'Change password', exact: true }).click(); await expect(page.getByLabel('Current password', { exact: true })).toBeFocused()
  await fill(page); await page.getByLabel('Confirm new password', { exact: true }).fill('mismatch')
  await page.getByRole('button', { name: 'Change password', exact: true }).click(); await expect(page.getByText('The new passwords must match.')).toBeVisible()
  await page.getByLabel('Confirm new password', { exact: true }).fill(nextPassword)
  for (const width of [1440, 768, 390, 320]) { await page.setViewportSize({ width, height: 950 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true) }
  await page.setViewportSize({ width: testInfo.project.name === 'mobile-chromium' ? 390 : 1440, height: 950 })
  await page.screenshot({ path: testInfo.outputPath('password-change.png'), fullPage: true })
  await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute('type', 'password')
  const saved = page.waitForRequest('**/api/v1/users/me/password')
  await page.getByRole('button', { name: 'Change password', exact: true }).click()
  expect((await saved).postDataJSON()).toEqual({ currentPassword: TEST_PASSWORD, newPassword: nextPassword })
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible(); await expect(page.getByText('Password updated', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
  await page.getByLabel('Email address').fill(email); await page.getByLabel('Password', { exact: true }).fill(nextPassword); await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
})
test('preserves definitive failure, honors throttling and only retries on submission', async ({ page }) => {
  let attempts = 0
  await page.route('**/api/v1/users/me/password', (route) => { attempts++; return route.fulfill({ status: attempts === 1 ? 429 : 401, headers: attempts === 1 ? { 'Retry-After': '1' } : {}, json: { error: {} } }) })
  await enter(page); await fill(page); await page.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Too many attempts')
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeEnabled(); expect(attempts).toBe(1)
  await page.getByRole('button', { name: 'Change password', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('current password or session is invalid')
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue(nextPassword); expect(attempts).toBe(2)
})
test('locks an uncertain change and offers sign-out to verify the new password without replay', async ({ page }) => {
  let attempts = 0
  await page.route('**/api/v1/users/me/password', (route) => { attempts++; return route.abort('failed') })
  await enter(page); await fill(page); await page.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('could not be confirmed')
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeDisabled()
  await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute('readonly', '')
  await page.getByRole('button', { name: 'Sign out and check password' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible(); expect(attempts).toBe(1)
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))
  expect(storage).not.toContain(TEST_PASSWORD); expect(storage).not.toContain(nextPassword)
})
