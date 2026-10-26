import { test, expect } from '@playwright/test'
import { createSessionResponse, TEST_EMAIL, TEST_PASSWORD } from '../src/test/auth-fixtures'
import { mockCurrentAdmin, mockEmptyOverview, openNavigation } from './auth-helpers'

test.beforeEach(async ({ page }) => {
  await mockCurrentAdmin(page)
  await mockEmptyOverview(page)
  await page.route('**/api/v1/auth-sessions/**', (route) => route.fulfill({ status: 503, json: { error: {} } }))
})

test('supports keyboard validation, password visibility and responsive layout', async ({ page }) => {
  await page.goto('/')
  const email = page.getByLabel('Email address')
  const password = page.getByLabel('Password', { exact: true })
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(email).toBeFocused()
  await expect(email).toHaveAccessibleDescription('Enter your email address.')
  await password.fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide password' }).click()
  await expect(password).toHaveAttribute('type', 'password')
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await expect(page.getByRole('img', { name: 'HireD', exact: true })).toBeVisible()
})

test('preserves input after invalid login and respects the server retry delay', async ({ page }) => {
  let attempts = 0
  await page.route('**/api/v1/auth-sessions/login', (route) => {
    attempts++
    return route.fulfill(attempts === 1
      ? { status: 401, json: { error: {} } }
      : { status: 429, headers: { 'Retry-After': '2' }, json: { error: { retryAfterSeconds: 2 } } })
  })
  await page.goto('/')
  await page.getByLabel('Email address').fill(TEST_EMAIL)
  const password = page.getByLabel('Password', { exact: true })
  await password.fill(TEST_PASSWORD)
  await password.press('Enter')
  await expect(page.getByRole('alert')).toHaveText('The email or password is incorrect.')
  await expect(password).toHaveValue(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Try again later' })).toBeDisabled()
  await expect(page.getByText('You can try signing in again.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled()
  expect(attempts).toBe(2)
})

test('completes a synthetic login/logout without persisting tokens', async ({ page }) => {
  await page.route('**/api/v1/auth-sessions/login', (route) => route.fulfill({ status: 200, json: createSessionResponse() }))
  await page.route('**/api/v1/auth-sessions/logout', (route) => route.fulfill({ status: 204 }))
  await page.goto('/')
  await page.getByLabel('Email address').fill(TEST_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
  await openNavigation(page)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
})

test('requires reauthentication after expiry and after a browser reload', async ({ page }) => {
  await page.route('**/api/v1/auth-sessions/login', (route) => route.fulfill({
    status: 200, json: createSessionResponse({ accessTokenExpiresAt: new Date(Date.now() + 1500).toISOString() }),
  }))
  await page.goto('/')
  await page.getByLabel('Email address').fill(TEST_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  await expect(page.getByText('Your session expired', { exact: true })).toBeVisible()
  await page.getByLabel('Email address').fill(TEST_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})
