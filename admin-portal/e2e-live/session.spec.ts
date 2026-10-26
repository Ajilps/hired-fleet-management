import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'

const email = `live-${randomUUID()}@example.test`
const password = 'synthetic-live-browser-password'
test.beforeAll(() => {
  execFileSync(process.execPath, ['--import', 'tsx', 'src/cli/create-admin.ts', '--email', email, '--name', 'Synthetic Live Admin'], {
    cwd: fileURLToPath(new URL('../../backend', import.meta.url)),
    env: { ...process.env, ADMIN_BOOTSTRAP_PASSWORD: password }, stdio: 'pipe',
  })
})

test('real admin login persists across reload, keeps refresh private and logs out', async ({ page, context }) => {
  await page.goto('/')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('incorrect')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('The email or password is incorrect.')
  await page.getByLabel('Password', { exact: true }).fill(password)
  const login = page.waitForResponse((response) => response.url().endsWith('/auth-sessions/login') && response.status() === 200)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  expect((await (await login).json()).refreshToken).toBeUndefined()
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  const cookie = (await context.cookies()).find((entry) => entry.name === 'hired_refresh')!
  expect(cookie.httpOnly).toBe(true)
  expect(cookie.sameSite).toBe('Lax')
  expect(await page.evaluate(() => document.cookie)).not.toContain('hired_refresh')
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  expect((await context.cookies()).find((entry) => entry.name === 'hired_refresh')!.value).not.toBe(cookie.value)
  const secondTab = await context.newPage()
  await secondTab.goto('/overview')
  await expect(secondTab.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(secondTab.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  expect((await context.cookies()).some((entry) => entry.name === 'hired_refresh')).toBe(false)
})
