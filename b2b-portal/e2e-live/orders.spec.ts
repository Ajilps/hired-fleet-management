import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
const api = 'http://127.0.0.1:3002/api/v1'
const email = `synthetic-orders-admin-${randomUUID()}@example.test`
const password = 'Synthetic orders admin password'
test.beforeAll(() => {
 execFileSync(process.execPath, ['--import', 'tsx', 'src/cli/create-admin.ts', '--email', email, '--name', 'Synthetic Orders Admin'], { cwd: fileURLToPath(new URL('../../backend', import.meta.url)), env: { ...process.env, ADMIN_BOOTSTRAP_PASSWORD: password }, stdio: 'pipe' })
})
test('real partner intake, admin decision, shared trip handoff, rejection and company isolation', async ({ page, browser }, info) => {
 const login = await page.request.post(`${api}/auth-sessions/login`, { data: { email, password } }); expect(login.status()).toBe(200)
 const administrator = await login.json(); const headers = { Authorization: `Bearer ${administrator.accessToken}`, 'Idempotency-Key': randomUUID() }
 const companyResponse = await page.request.post(`${api}/companies`, { headers, data: { legalName: 'Synthetic Orders Company', displayName: 'Synthetic Orders', contactName: 'Synthetic Contact', contactEmail: 'synthetic-order-mail@example.test', contactPhone: '123', billingAddress: 'Synthetic billing', initialPayoutRate: { driverPercent: '30.00', companyPercent: '70.00' } } }); expect(companyResponse.status()).toBe(201)
 const company = await companyResponse.json(); const partnerEmail = `synthetic-orders-partner-${randomUUID()}@example.test`; const initial = 'Synthetic initial orders password'; const chosen = 'Synthetic chosen orders password'
 const provision = await page.request.post(`${api}/companies/${company.id}/partners`, { headers: { ...headers, 'Idempotency-Key': randomUUID() }, data: { email: partnerEmail, fullName: 'Synthetic Order Partner', initialPassword: initial, isPrimaryContact: true } }); expect(provision.status()).toBe(201)
 const first = await page.request.post(`${api}/auth-sessions/login`, { data: { email: partnerEmail, password: initial } }); const restricted = await first.json()
 expect((await page.request.post(`${api}/users/me/password`, { headers: { Authorization: `Bearer ${restricted.accessToken}` }, data: { currentPassword: initial, newPassword: chosen } })).status()).toBe(204)
 await page.goto('/login'); await page.getByLabel('Work email').fill(partnerEmail); await page.getByLabel('Password', { exact: true }).fill(chosen); await page.getByRole('button', { name: 'Sign in', exact: true }).click()
 await expect(page.getByRole('heading', { name: 'Hello, Synthetic.' })).toBeVisible()
 async function submit(pickup: string) {
  await page.goto('/orders/new'); await page.getByLabel('Pickup address').fill(pickup); await page.getByLabel('Destination address').fill('Synthetic Destination'); await page.getByLabel('Pickup date · IST').fill('2026-11-01'); await page.getByLabel('Pickup time · IST').fill('10:30'); await page.getByLabel('Contact phone').fill('123456789')
  await page.getByRole('button', { name: 'Review request' }).click()
  const response = page.waitForResponse(value => value.url().endsWith('/api/v1/orders') && value.request().method() === 'POST')
  await page.getByRole('button', { name: 'Submit request' }).click(); const created = await response; expect(created.status()).toBe(201)
  const body = await created.json(); await expect(page.getByText('Request received. HireD will review it and confirm the next steps.')).toBeVisible(); return body
 }
 const order = await submit('Synthetic Partner Pickup')
 const adminContext = await browser.newContext({ viewport: info.project.use.viewport, isMobile: info.project.use.isMobile, hasTouch: info.project.use.hasTouch })
 try {
  const admin = await adminContext.newPage(); await admin.goto('http://127.0.0.1:4178/login'); await admin.getByLabel('Email address').fill(email); await admin.getByLabel('Password', { exact: true }).fill(password); await admin.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(admin.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  await admin.goto(`http://127.0.0.1:4178/orders/${order.id}`); await expect(admin.getByText('Synthetic Partner Pickup', { exact: true })).toBeVisible()
  await admin.getByRole('button', { name: 'Accept order', exact: true }).click(); await admin.getByLabel('Trip amount · INR *').fill('1234.56')
  const response = admin.waitForResponse(value => value.url().endsWith(`/orders/${order.id}/accept`)); await admin.getByRole('button', { name: 'Confirm acceptance' }).click(); const decision = await response; expect(decision.status()).toBe(200); const accepted = await decision.json()
  await admin.getByRole('link', { name: 'View resulting trip' }).click(); await expect(admin.getByRole('heading', { name: 'Trip summary' })).toBeVisible(); await expect(admin.getByText('unassigned', { exact: true })).toBeVisible(); await expect(admin.getByText('₹1234.56', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Refresh order' }).click(); await expect(page.getByRole('heading', { name: 'Your journey is taking shape.' })).toBeVisible(); await page.getByRole('link', { name: 'View trip', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Your journey' })).toBeVisible(); await expect(page.locator('.amount')).toContainText('1,234.56')
  await page.reload(); await expect(page.getByRole('heading', { name: 'Your journey' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('partner-unassigned-trip.png') }); await admin.screenshot({ path: info.outputPath('admin-accepted-trip.png') })
  const rejected = await submit('Synthetic Rejected Pickup'); await admin.goto(`http://127.0.0.1:4178/orders/${rejected.id}`); await admin.getByRole('button', { name: 'Reject order', exact: true }).click(); await admin.getByLabel('Rejection reason *').fill('Synthetic no service capacity'); const rejection = admin.waitForResponse(value => value.url().endsWith(`/orders/${rejected.id}/reject`)); await admin.getByRole('button', { name: 'Confirm rejection' }).click(); expect((await rejection).status()).toBe(200); await expect(admin.getByRole('dialog')).toBeHidden(); await expect(admin.getByRole('paragraph').filter({ hasText: 'Synthetic no service capacity' })).toBeVisible()
  await page.getByRole('button', { name: 'Refresh order' }).click(); await expect(page.getByRole('heading', { name: 'This request was declined.' })).toBeVisible(); await expect(page.getByText('Synthetic no service capacity', { exact: true })).toBeVisible()
  const intents = await page.request.get(`${api}/notifications?companyIds=${company.id}`, { headers }); expect(intents.status()).toBe(200); expect((await intents.json()).pageInfo.totalCount).toBe(2)
  // The admin intake screen exercises its own strict company/source DTO.
  await admin.goto('http://127.0.0.1:4178/orders/new')
  await admin.getByLabel('Company *').selectOption(company.id)
  await admin.getByLabel('Booking source *').selectOption('admin_manual')
  await admin.getByLabel('Pickup address *').fill('Synthetic Admin Pickup')
  await admin.getByLabel('Drop-off address *').fill('Synthetic Admin Drop')
  await admin.getByLabel('Pickup date and time · IST *').fill('2026-11-02T10:30')
  await admin.getByLabel('Contact name *').fill('Synthetic Contact')
  await admin.getByLabel('Contact phone *').fill('123456789')
  const intake = admin.waitForResponse(value => value.url().endsWith('/api/v1/orders') && value.request().method() === 'POST')
  await admin.getByRole('button', { name: 'Save order', exact: true }).click()
  const manual = await intake; expect(manual.status()).toBe(201); expect((await manual.json()).source).toBe('admin_manual')
  await expect(admin.getByText('Order saved as Received. Review it before accepting or rejecting.')).toBeVisible()
  // Separate company membership cannot read either saved order or resulting trip.
  const foreignCompany = await page.request.post(`${api}/companies`, { headers: { ...headers, 'Idempotency-Key': randomUUID() }, data: { ...company, id: undefined, createdAt: undefined, updatedAt: undefined, isActive: undefined, initialPayoutRate: { driverPercent: '30.00', companyPercent: '70.00' } } }); expect(foreignCompany.status()).toBe(201)
  const foreign = await foreignCompany.json(); const foreignEmail = `synthetic-foreign-${randomUUID()}@example.test`
  await page.request.post(`${api}/companies/${foreign.id}/partners`, { headers: { ...headers, 'Idempotency-Key': randomUUID() }, data: { email: foreignEmail, fullName: 'Synthetic Foreign', initialPassword: initial, isPrimaryContact: true } })
  const foreignLogin = await page.request.post(`${api}/auth-sessions/login`, { data: { email: foreignEmail, password: initial } }); const foreignRestricted = await foreignLogin.json(); await page.request.post(`${api}/users/me/password`, { headers: { Authorization: `Bearer ${foreignRestricted.accessToken}` }, data: { currentPassword: initial, newPassword: chosen } })
  const fresh = await page.request.post(`${api}/auth-sessions/login`, { data: { email: foreignEmail, password: chosen } }); const other = await fresh.json(); const foreignHeaders = { Authorization: `Bearer ${other.accessToken}` }
  expect((await page.request.get(`${api}/orders/${order.id}`, { headers: foreignHeaders })).status()).toBe(404); expect((await page.request.get(`${api}/trips/${accepted.trip.id}`, { headers: foreignHeaders })).status()).toBe(404)
 } finally { await adminContext.close() }
})
