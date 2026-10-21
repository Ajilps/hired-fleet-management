import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
const isEnabled = process.env.TEST_DOCUMENTS_LIVE === 'true'
const email = `live-documents-admin-${randomUUID()}@example.test`; const password = 'Synthetic live document admin password'
const backend = fileURLToPath(new URL('../../backend', import.meta.url))
test.beforeAll(() => {
  if (isEnabled) execFileSync(process.execPath, ['--import', 'tsx', 'src/cli/create-admin.ts', '--email', email, '--name', 'Synthetic Documents Admin'], { cwd: backend, env: { ...process.env, ADMIN_BOOTSTRAP_PASSWORD: password }, stdio: 'pipe' })
})
test('admin previews a current previously-clean synthetic document through real API/storage and activates only after four clean documents', async ({ page }, testInfo) => {
  test.skip(!isEnabled, 'Requires explicit disposable live storage configuration.')
  await page.goto('/login'); await page.getByLabel('Email address').fill(email); await page.getByLabel('Password', { exact: true }).fill(password)
  const login = page.waitForResponse(response => response.url().endsWith('/auth-sessions/login') && response.status() === 200)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); const adminToken = (await (await login).json()).accessToken
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  const api = 'http://127.0.0.1:3001/api/v1'; const initial = 'Synthetic driver initial password'; const chosen = 'Synthetic driver chosen password'
  const driverEmail = `live-document-driver-${randomUUID()}@example.test`
  const created = await page.request.post(`${api}/drivers`, { headers: { Authorization: `Bearer ${adminToken}`, 'Idempotency-Key': randomUUID() }, data: { email: driverEmail, fullName: 'Synthetic Document Driver', phone: '+91 synthetic', initialPassword: initial } }); expect(created.status()).toBe(201)
  const driver = await created.json()
  const first = await (await page.request.post(`${api}/auth-sessions/login`, { data: { email: driverEmail, password: initial } })).json()
  expect((await page.request.post(`${api}/users/me/password`, { headers: { Authorization: `Bearer ${first.accessToken}` }, data: { currentPassword: initial, newPassword: chosen } })).status()).toBe(204)
  const fresh = await (await page.request.post(`${api}/auth-sessions/login`, { data: { email: driverEmail, password: chosen } })).json()
  const previewBytes = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 280
    const context = canvas.getContext('2d')!
    context.fillStyle = '#f4f0ff'; context.fillRect(0, 0, 640, 280)
    context.fillStyle = '#503080'; context.font = 'bold 28px sans-serif'
    context.fillText('SYNTHETIC TEST DOCUMENT', 30, 70)
    context.font = '22px sans-serif'; context.fillText('Private preview transport check', 30, 125)
    context.fillText('No personal data · Not a real identity document', 30, 175)
    context.fillText('Previously-clean fixture', 30, 225)
    return canvas.toDataURL('image/png').split(',')[1]!
  })
  const assetId = execFileSync(process.execPath, ['--import', 'tsx', 'tests/helpers/create-document-preview.ts'], { cwd: backend, env: { ...process.env, NODE_ENV: 'test' }, input: JSON.stringify({ driverId: driver.id, userId: driver.user.id, bytes: previewBytes }), encoding: 'utf8' }).trim()
  const attached = await page.request.post(`${api}/drivers/me/documents`, { headers: { Authorization: `Bearer ${fresh.accessToken}`, 'Idempotency-Key': randomUUID() }, data: { documentType: 'driving_license', fileAssetId: assetId, documentNumber: 'SYNTHETIC-ENCRYPTED-1234' } }); expect(attached.status()).toBe(201)
  expect((await attached.json()).maskedDocumentNumber).toBe('****1234')
  await page.goto(`/drivers/${driver.id}`)
  const mint = page.waitForResponse(response => response.url().endsWith(`/file-assets/${assetId}/download-links`))
  await page.getByRole('button', { name: 'View Driving Licence privately' }).click(); expect((await mint).status()).toBe(200)
  const image = page.getByRole('img', { name: 'Driving Licence private document' }); await expect(image).toBeVisible(); await expect(image).toHaveAttribute('src', /^blob:/)
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(640)
  await page.screenshot({ path: testInfo.outputPath('document-preview-live.png'), fullPage: true })
  await page.getByRole('button', { name: 'Close preview' }).click(); await expect(image).toHaveCount(0)
  for (const documentType of ['aadhar', 'pan', 'pcc']) {
    const id = execFileSync(process.execPath, ['--import', 'tsx', 'tests/helpers/create-document-preview.ts'], { cwd: backend, env: { ...process.env, NODE_ENV: 'test' }, input: JSON.stringify({ driverId: driver.id, userId: driver.user.id, bytes: previewBytes }), encoding: 'utf8' }).trim()
    expect((await page.request.post(`${api}/drivers/me/documents`, { headers: { Authorization: `Bearer ${fresh.accessToken}`, 'Idempotency-Key': randomUUID() }, data: { documentType, fileAssetId: id } })).status()).toBe(201)
  }
  await page.reload(); await page.getByRole('button', { name: 'Activate driver', exact: true }).click()
  await page.getByRole('textbox', { name: 'Activation reason *', exact: true }).fill('Synthetic four-document operational activation')
  const activation = page.waitForResponse(response => response.url().endsWith(`/drivers/${driver.id}/status`) && response.request().method() === 'PATCH')
  await page.getByRole('button', { name: 'Confirm activation', exact: true }).click(); const saved = await activation
  expect(saved.status()).toBe(200); expect((await saved.json()).status).toBe('active')
  await expect(page.getByText('Driver activation saved. Online status and calendar availability remain separate.')).toBeVisible()
  await page.getByRole('heading', { name: 'Synthetic Document Driver', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('driver-activation-live.png'), fullPage: true })
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('SYNTHETIC-ENCRYPTED')
})
