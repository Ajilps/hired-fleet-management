import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'

const email = `live-companies-${randomUUID()}@example.test`
const password = 'synthetic-live-company-password'
test.beforeAll(() => {
  execFileSync(process.execPath, ['--import', 'tsx', 'src/cli/create-admin.ts', '--email', email, '--name', 'Synthetic Company Admin'], {
    cwd: fileURLToPath(new URL('../../backend', import.meta.url)),
    env: { ...process.env, ADMIN_BOOTSTRAP_PASSWORD: password }, stdio: 'pipe',
  })
})

test('real company creation, directory, profile and rate history survive reload', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  const login = page.waitForResponse((response) => response.url().endsWith('/auth-sessions/login') && response.status() === 200)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const accessToken = (await (await login).json()).accessToken as string
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  await page.goto('/companies')
  await expect(page.getByRole('heading', { name: 'Companies', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Create company', exact: true }).click()
  const name = `Synthetic live ${randomUUID()}`
  for (const [label, value] of [
    ['Legal company name *', `${name} Legal`], ['Display name *', name], ['Contact name *', 'Synthetic Contact'],
    ['Contact email *', 'Contact@example.test'], ['Contact phone *', '123456789'], ['Billing address *', 'Synthetic billing address'],
    ['Driver share · % *', '33.33'], ['Company share · % *', '66.67'],
  ]) await page.getByLabel(label!).fill(value!)
  const creation = page.waitForResponse((response) => response.url().endsWith('/api/v1/companies') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Create company', exact: true }).click()
  const created = await creation
  expect(created.status()).toBe(201)
  const company = await created.json()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.getByText('33.33%', { exact: true })).toBeVisible()
  await expect(page.getByText('66.67%', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Provision partner account', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Provision partner account', exact: true }).click()
  const partnerEmail = `LIVE-PARTNER-${randomUUID()}@EXAMPLE.TEST`
  const initialPassword = 'synthetic-live-initial-password'
  await page.getByLabel('Partner name *').fill('Synthetic Live Partner')
  await page.getByLabel('Email / login *').fill(partnerEmail)
  await page.getByLabel('Initial password *').fill(initialPassword)
  await expect(page.getByText('The partner must change this password on first login.', { exact: false })).toBeVisible()
  const provision = page.waitForResponse((response) => response.url().endsWith(`/companies/${company.id}/partners`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  expect((await provision).status()).toBe(201)
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByRole('row').filter({ hasText: partnerEmail.toLowerCase() })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.getByText('33.33%', { exact: true })).toBeVisible()
  const api = 'http://127.0.0.1:3001/api/v1'
  await expect(page.getByRole('row').filter({ hasText: partnerEmail.toLowerCase() })).toBeVisible()
  // A separate browser context exercises the cookie lifecycle without replacing the admin cookie.
  const partnerContext = await page.context().browser()!.newContext()
  try {
    const partnerPage = await partnerContext.newPage()
    await partnerPage.goto('http://127.0.0.1:4175/login')
    await expect(partnerPage.getByLabel('Email address')).toBeVisible()
    const call = (path: string, method: string, data?: unknown, bearer?: string) => partnerPage.evaluate(async ({ path, method, data, bearer }) => {
      const response = await fetch(`http://127.0.0.1:3001/api/v1/${path}`, { method, credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-CSRF-Guard': '1', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) })
      return { status: response.status, body: response.status === 204 ? null : await response.json() }
    }, { path, method, data, bearer })
    const signedIn = await call('auth-sessions/login', 'POST', { email: partnerEmail, password: initialPassword, transport: 'browser' })
    expect(signedIn.status).toBe(200); expect(signedIn.body.user.companyId).toBe(company.id); expect(signedIn.body.user.passwordChangeRequired).toBe(true)
    expect(signedIn.body.refreshToken).toBeUndefined()
    expect((await call(`companies/${company.id}`, 'GET', undefined, signedIn.body.accessToken)).status).toBe(403)
    expect((await partnerContext.cookies()).find((cookie) => cookie.name === 'hired_refresh')?.httpOnly).toBe(true)
    const newPassword = 'synthetic-live-changed-password'
    expect((await call('users/me/password', 'POST', { currentPassword: initialPassword, newPassword }, signedIn.body.accessToken)).status).toBe(204)
    expect((await partnerContext.cookies()).some((cookie) => cookie.name === 'hired_refresh')).toBe(false)
    expect((await call('users/me', 'GET', undefined, signedIn.body.accessToken)).status).toBe(401)
    const fresh = await call('auth-sessions/login', 'POST', { email: partnerEmail, password: newPassword, transport: 'browser' })
    expect(fresh.status).toBe(200); expect(fresh.body.user.passwordChangeRequired).toBe(false)
    expect((await call(`companies/${company.id}`, 'GET', undefined, fresh.body.accessToken)).status).toBe(200)
    expect((await call(`companies/${randomUUID()}`, 'GET', undefined, fresh.body.accessToken)).status).toBe(404)
    expect((await call('companies', 'GET', undefined, fresh.body.accessToken)).status).toBe(403)
    const restored = await call('auth-sessions/refresh', 'POST', { transport: 'browser' })
    expect(restored.status).toBe(200); expect(restored.body.user.companyId).toBe(company.id)
    // Partners still cannot enter the admin shell; the issued session is revoked by its role guard.
    await partnerPage.getByLabel('Email address').fill(partnerEmail)
    await partnerPage.getByLabel('Password', { exact: true }).fill(newPassword)
    await partnerPage.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(partnerPage.getByRole('alert')).toContainText('Unable to sign in to the admin portal.')
    expect((await partnerContext.cookies()).some((cookie) => cookie.name === 'hired_refresh')).toBe(false)
  } finally { await partnerContext.close() }
  const headers = { Authorization: `Bearer ${accessToken}`, 'Idempotency-Key': randomUUID() }
  const changed = await page.request.post(`${api}/companies/${company.id}/payout-rates`, { headers, data: { driverPercent: '65.25', companyPercent: '34.75', reason: 'Synthetic live rate change' } })
  expect(changed.status()).toBe(201)
  const replay = await page.request.post(`${api}/companies/${company.id}/payout-rates`, { headers, data: { driverPercent: '65.25', companyPercent: '34.75', reason: 'Synthetic live rate change' } })
  expect(await replay.json()).toEqual(await changed.json())
  await page.getByRole('button', { name: 'Refresh payout split', exact: true }).click()
  await expect(page.getByText('65.25%', { exact: true })).toBeVisible()
  await expect(page.getByText('34.75%', { exact: true })).toBeVisible()
  const history = await page.request.get(`${api}/companies/${company.id}/payout-rates`, { headers: { Authorization: `Bearer ${accessToken}` } })
  expect((await history.json()).pageInfo.totalCount).toBe(2)
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0) })
  await page.screenshot({ path: testInfo.outputPath('company-profile.png'), fullPage: true })
  await page.getByRole('link', { name: 'Back to companies' }).click()
  await expect(page.getByRole('link', { name: `View ${name}`, exact: true })).toBeVisible()
})
