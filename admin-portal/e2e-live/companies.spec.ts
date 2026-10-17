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
  await expect(page.getByRole('button', { name: 'Provision partner account', exact: true })).toBeDisabled()
  await expect(page.getByRole('alert')).toHaveText('Partner accounts are currently unavailable. Try refreshing later.')
  await page.reload()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.getByText('33.33%', { exact: true })).toBeVisible()
  const api = 'http://127.0.0.1:3001/api/v1'
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
