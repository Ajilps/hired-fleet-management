import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'

const email = `live-account-operator-${randomUUID()}@example.test`
const password = 'synthetic-live-operator-password'
test.beforeAll(() => {
  execFileSync(process.execPath, ['--import', 'tsx', 'src/cli/create-admin.ts', '--email', email, '--name', 'Synthetic Account Operator'], { cwd: fileURLToPath(new URL('../../backend', import.meta.url)), env: { ...process.env, ADMIN_BOOTSTRAP_PASSWORD: password }, stdio: 'pipe' })
})
test('real admin provisioning, first-login change and disable/enable keep session and replay boundaries', async ({ page }, testInfo) => {
  await page.goto('/login'); await page.getByLabel('Email address').fill(email); await page.getByLabel('Password', { exact: true }).fill(password)
  const operatorLogin = page.waitForResponse('**/api/v1/auth-sessions/login'); await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const operatorToken = (await (await operatorLogin).json()).accessToken
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  const api = 'http://127.0.0.1:3001/api/v1'
  const body = { email: `live-new-admin-${randomUUID()}@example.test`, fullName: 'Synthetic Provisioned Admin', role: 'admin', initialPassword: 'synthetic-initial-admin-password' }
  const key = randomUUID(); const headers = { Authorization: `Bearer ${operatorToken}`, 'Idempotency-Key': key }
  const created = await page.request.post(`${api}/users`, { headers, data: body }); expect(created.status()).toBe(201)
  const account = await created.json(); expect(account.passwordChangeRequired).toBe(true)
  const context = await page.context().browser()!.newContext({ viewport: page.viewportSize()!, isMobile: testInfo.project.name === 'mobile', hasTouch: testInfo.project.name === 'mobile' })
  try {
    const member = await context.newPage(); await member.goto('http://127.0.0.1:4175/login')
    await member.getByLabel('Email address').fill(body.email); await member.getByLabel('Password', { exact: true }).fill(body.initialPassword)
    const firstLogin = member.waitForResponse('**/api/v1/auth-sessions/login'); await member.getByRole('button', { name: 'Sign in', exact: true }).click()
    const initial = await (await firstLogin).json()
    await expect(member.getByRole('heading', { name: 'Change your password' })).toBeVisible()
    await expect(member.getByRole('navigation', { name: 'Main navigation' })).toBeHidden()
    await member.reload(); await expect(member.getByRole('heading', { name: 'Change your password' })).toBeVisible()
    const newPassword = 'synthetic-changed-admin-password'
    await member.getByLabel('Current password', { exact: true }).fill(body.initialPassword); await member.getByLabel('New password', { exact: true }).fill(newPassword); await member.getByLabel('Confirm new password', { exact: true }).fill(newPassword)
    await member.screenshot({ path: testInfo.outputPath('admin-first-login.png'), fullPage: true })
    const change = member.waitForResponse('**/api/v1/users/me/password'); await member.getByRole('button', { name: 'Change password', exact: true }).click()
    expect((await change).status()).toBe(204)
    await expect(member.getByRole('heading', { name: 'Welcome back' })).toBeVisible(); await expect(member.getByText('Password updated', { exact: true })).toBeVisible()
    expect((await context.cookies()).some((cookie) => cookie.name === 'hired_refresh')).toBe(false)
    expect((await member.request.get(`${api}/users/me`, { headers: { Authorization: `Bearer ${initial.accessToken}` } })).status()).toBe(401)
    await member.getByLabel('Email address').fill(body.email); await member.getByLabel('Password', { exact: true }).fill(newPassword)
    const newLogin = member.waitForResponse('**/api/v1/auth-sessions/login'); await member.getByRole('button', { name: 'Sign in', exact: true }).click()
    const fresh = await (await newLogin).json(); await expect(member.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
    const list = await page.request.get(`${api}/users?role=admin`, { headers }); expect(list.status()).toBe(200); expect((await list.json()).items.some((value: { id: string }) => value.id === account.id)).toBe(true)
    const statusHeaders = { Authorization: `Bearer ${operatorToken}`, 'Idempotency-Key': randomUUID() }
    const disabled = await page.request.patch(`${api}/users/${account.id}/status`, { headers: statusHeaders, data: { isActive: false, reason: 'Synthetic live disable' } }); expect(disabled.status()).toBe(200)
    expect((await member.request.get(`${api}/users/me`, { headers: { Authorization: `Bearer ${fresh.accessToken}` } })).status()).toBe(401)
    await member.reload(); await expect(member.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    const enabled = await page.request.patch(`${api}/users/${account.id}/status`, { headers: { ...statusHeaders, 'Idempotency-Key': randomUUID() }, data: { isActive: true, reason: 'Synthetic live enable' } }); expect(enabled.status()).toBe(200)
    expect((await member.request.get(`${api}/users/me`, { headers: { Authorization: `Bearer ${fresh.accessToken}` } })).status()).toBe(401)
    const replay = await page.request.post(`${api}/users`, { headers, data: body }); expect(await replay.json()).toEqual(account)
    const disabledReplay = await page.request.patch(`${api}/users/${account.id}/status`, { headers: statusHeaders, data: { isActive: false, reason: 'Synthetic live disable' } }); expect(await disabledReplay.json()).toEqual(await disabled.json())
    const current = await page.request.get(`${api}/users/${account.id}`, { headers }); expect((await current.json()).isActive).toBe(true)
    const storage = await member.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })); expect(storage).not.toContain(newPassword); expect(storage).not.toContain(body.initialPassword)
  } finally { await context.close() }
})
