import { expect, test } from '@playwright/test'
import { createSessionResponse } from '../src/test/auth-fixtures'
import { mockCurrentAdmin, mockEmptyCompanies, mockEmptyOverview, openNavigation, signIn } from './auth-helpers'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth-sessions/login', (route) => route.fulfill({ status: 200, json: createSessionResponse() }))
  await page.route('**/api/v1/auth-sessions/logout', (route) => route.fulfill({ status: 204 }))
  await mockCurrentAdmin(page)
  await mockEmptyOverview(page)
  await mockEmptyCompanies(page)
})

test('redirects direct signed-out routes and refreshes to login', async ({ page }) => {
  for (const path of ['/orders', '/reports', '/missing']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  }
  await signIn(page)
  await expect(page).toHaveURL(/\/overview$/)
  await page.reload()
  await expect(page).toHaveURL(/\/login$/)
})

test('gates the workspace until verification succeeds and allows explicit retry', async ({ page }) => {
  let attempts = 0
  let isAvailable = false
  await page.route('**/api/v1/users/me', (route) => {
    attempts++
    expect(route.request().headers().authorization).toBe('Bearer synthetic-access-token')
    return route.fulfill(isAvailable
      ? { status: 200, json: createSessionResponse().user }
      : { status: 503, json: { error: {} } })
  })
  await page.goto('/login')
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'We couldn’t verify your session' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden()
  expect(attempts).toBeGreaterThanOrEqual(1)
  isAvailable = true
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
})

test('clears a server-rejected session and returns to sign-in', async ({ page }) => {
  await page.route('**/api/v1/users/me', (route) => route.fulfill({ status: 401, json: { error: {} } }))
  await page.goto('/login')
  await signIn(page)
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('Your session expired', { exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden()
})

test('navigates all sections with active links, focused content and narrow layouts', async ({ page }) => {
  await page.goto('/login')
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  for (const [label, path] of [
    ['Orders', '/orders'], ['Trips', '/trips'], ['Drivers', '/drivers'],
    ['Companies', '/companies'], ['Payroll settings', '/payroll-settings'],
    ['Monthly statements', '/statements'], ['Reports', '/reports'], ['Overview', '/overview'],
  ]) {
    await openNavigation(page)
    await page.getByRole('link', { name: label, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.getByRole('main')).toBeFocused()
    await expect(page).toHaveTitle(`${label} | HireD Admin`)
    await openNavigation(page)
    await expect(page.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page')
    const close = page.getByRole('button', { name: 'Close navigation' })
    if (await close.isVisible()) await close.click()
  }
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  }
  await openNavigation(page)
  await page.goBack()
  await expect(page).toHaveURL(/\/reports$/)
  await expect(page.getByRole('dialog', { name: 'Admin navigation' })).toBeHidden()
  await expect(page.getByRole('main')).toBeFocused()
})

test('contains keyboard focus in the mobile drawer and restores it after Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await signIn(page)
  const menu = page.getByRole('button', { name: 'Open navigation' })
  await menu.click()
  const drawer = page.getByRole('dialog', { name: 'Admin navigation' })
  await expect(drawer).toBeVisible()
  await expect(menu).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('main').evaluate((element) => element.focus())
  await expect(page.getByRole('main')).not.toBeFocused()
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab')
    // A native modal may hand focus to browser chrome between tab cycles.
    expect(await drawer.evaluate((element) => element.contains(document.activeElement) || document.activeElement === document.body)).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
  await expect(menu).toBeFocused()
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
})

test('preserves failed logout for retry and blocks browser-back access after successful logout', async ({ page }) => {
  let attempts = 0
  await page.route('**/api/v1/auth-sessions/logout', (route) => {
    attempts++
    return route.fulfill(attempts === 1 ? { status: 503, json: { error: {} } } : { status: 204 })
  })
  await page.goto('/login')
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  await openNavigation(page)
  await page.getByRole('link', { name: 'Orders', exact: true }).click()
  await openNavigation(page)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('alert')).toHaveText('Unable to sign out. Check your connection and try again.')
  await expect(page).toHaveURL(/\/orders$/)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})
