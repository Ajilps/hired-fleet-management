import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSessionResponse } from '../src/test/auth-fixtures'
import { companyList, companyResponse, rateList } from '../src/test/company-fixtures'
import { TEST_COMPANY_ID } from '../src/test/order-fixtures'
import { partnerInput, partnerList, partnerResponse, TEST_PARTNER_PASSWORD } from '../src/test/partner-fixtures'
import { mockCurrentAdmin, mockEmptyOverview, openNavigation, signIn } from './auth-helpers'

async function openCompany(page: Page) {
  await page.goto('/login')
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  await openNavigation(page)
  await page.getByRole('link', { name: 'Companies', exact: true }).click()
  await page.getByRole('link', { name: 'View Acme Mobility' }).click()
  await expect(page.getByRole('heading', { name: 'Acme Mobility', exact: true })).toBeVisible()
}
async function openDialog(page: Page) { await page.getByRole('button', { name: 'Provision partner account' }).click() }
async function fillPartner(page: Page) {
  await page.getByLabel('Partner name *', { exact: true }).fill(partnerInput().fullName)
  await page.getByLabel('Email / login *', { exact: true }).fill(partnerInput().email)
  await page.getByLabel('Initial password *', { exact: true }).fill(TEST_PARTNER_PASSWORD)
}
test.beforeEach(async ({ page }) => {
  await mockCurrentAdmin(page)
  await mockEmptyOverview(page)
  await page.route('**/api/v1/auth-sessions/login', (route) => route.fulfill({ json: createSessionResponse() }))
  await page.route('**/api/v1/companies?*', (route) => route.fulfill({ json: companyList() }))
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}`, (route) => route.fulfill({ json: companyResponse() }))
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}/payout-rates?*`, (route) => route.fulfill({ json: rateList() }))
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}/partners?*`, (route) => route.fulfill({ json: partnerList([]) }))
})

test('validates and contains keyboard focus, masks passwords and clears canceled credentials', async ({ page }, testInfo) => {
  let submits = 0
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}/partners`, (route) => { submits++; return route.fulfill({ status: 201, json: partnerResponse() }) })
  await openCompany(page)
  await openDialog(page)
  const dialog = page.getByRole('dialog', { name: 'Create partner account' })
  await expect(page.getByLabel('Partner name *')).toBeFocused()
  await expect(dialog).toContainText('Account access is restricted to Acme Mobility.')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByLabel('Partner name *')).toBeFocused()
  await fillPartner(page)
  await page.getByLabel('Email / login *').fill('invalid')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByLabel('Email / login *')).toBeFocused()
  expect(submits).toBe(0)
  await page.getByLabel('Email / login *').fill(partnerInput().email)
  await expect(page.getByLabel('Initial password *')).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Show initial password' }).click()
  await expect(page.getByLabel('Initial password *')).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide initial password' }).click()
  const lastControl = page.getByRole('button', { name: 'Create account', exact: true })
  await lastControl.focus()
  await expect(lastControl).toBeFocused()
  // Chromium can wrap directly or pass through browser chrome. Check each step,
  // stopping as soon as the first field is reached instead of tabbing past it.
  let wrapped = false
  for (let step = 0; step < 3; step++) {
    await page.keyboard.press('Tab')
    const focus = await dialog.evaluate((node) => ({
      isContained: node.contains(document.activeElement) || document.activeElement === document.body,
      isFirstField: document.activeElement === document.getElementById('partner-fullName'),
    }))
    expect(focus.isContained).toBe(true)
    if (focus.isFirstField) { wrapped = true; break }
  }
  expect(wrapped).toBe(true)
  await expect(page.getByLabel('Partner name *')).toBeFocused()
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await dialog.screenshot({ path: testInfo.outputPath('provision-partner-desktop.png') })
  await page.setViewportSize({ width: 390, height: 1000 })
  await dialog.screenshot({ path: testInfo.outputPath('provision-partner-mobile.png') })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: 'Provision partner account' })).toBeFocused()
  await openDialog(page)
  await expect(page.getByLabel('Initial password *')).toHaveValue('')
  await expect(page.getByLabel('Email / login *')).toHaveValue('')
})

test('creates one company-scoped account, refreshes the directory and discards issued credentials', async ({ page }) => {
  let isSaved = false
  let submits = 0
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}/partners?*`, (route) => route.fulfill({ json: isSaved ? partnerList([{ ...partnerResponse(), isPrimaryContact: true, user: { ...partnerResponse().user, phone: '+919800000001' } }]) : partnerList([]) }))
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}/partners`, (route) => {
    submits++
    expect(route.request().postDataJSON()).toEqual({ ...partnerInput(), phone: '+919800000001', isPrimaryContact: true })
    expect(route.request().headers()['idempotency-key']).toBeTruthy()
    expect(route.request().headers()['if-match']).toBeUndefined()
    isSaved = true
    return route.fulfill({ status: 201, json: { ...partnerResponse(), isPrimaryContact: true, user: { ...partnerResponse().user, phone: '+919800000001' } } })
  })
  await openCompany(page)
  await openDialog(page)
  await fillPartner(page)
  await page.getByLabel('Phone · optional').fill('+919800000001')
  await page.getByLabel('Primary company contact').check()
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByRole('status').filter({ hasText: 'Partner account saved for' })).toContainText('partner@acme.example')
  const accounts = page.getByRole('region', { name: 'Partner accounts' })
  await expect(accounts.getByRole('table')).toContainText('Synthetic Partner')
  await expect(accounts.getByRole('table')).toContainText('+919800000001')
  await expect(accounts.getByRole('table')).toContainText('Yes')
  expect(submits).toBe(1)
  expect(page.url()).not.toContain(TEST_PARTNER_PASSWORD)
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))
  expect(storage).not.toContain(TEST_PARTNER_PASSWORD)
  await openDialog(page)
  await expect(page.getByLabel('Initial password *')).toHaveValue('')
})

test('preserves failed input and requires refreshed review after a definitive account conflict', async ({ page }, testInfo) => {
  let attempts = 0
  let listReads = 0
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}/partners?*`, (route) => { listReads++; return route.fulfill({ json: partnerList([]) }) })
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}/partners`, (route) => {
    attempts++
    return route.fulfill(attempts === 1 ? { status: 422, json: { error: {} } } : attempts === 2 ? { status: 409, json: { error: { code: 'DUPLICATE_EMAIL' } } } : { status: 201, json: partnerResponse() })
  })
  await openCompany(page)
  await openDialog(page)
  await fillPartner(page)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Check the entered values')
  await expect(page.getByLabel('Initial password *')).toHaveValue(TEST_PARTNER_PASSWORD)
  await expect(page.getByLabel('Email / login *')).toBeEnabled()
  await page.getByRole('dialog').screenshot({ path: testInfo.outputPath('partner-provision-failed.png') })
  await page.getByRole('button', { name: 'Retry account setup', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('review the email')
  await expect(page.getByRole('button', { name: 'Retry account setup', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Refresh partner accounts for review' }).click()
  await expect(page.getByRole('button', { name: 'Retry account setup', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Retry account setup', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Partner account saved for' })).toBeVisible()
  expect(listReads).toBeGreaterThanOrEqual(2)
  expect(attempts).toBe(3)
})

test('locks interrupted setup and replays the same account through in-progress and rate-limit feedback', async ({ page }) => {
  const requests: { path: string; key: string; body: string | null }[] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}/partners`, async (route) => {
    requests.push({ path: route.request().url(), key: route.request().headers()['idempotency-key'], body: route.request().postData() })
    if (requests.length === 1) { await gate; await route.abort('failed'); return }
    await route.fulfill(requests.length === 2 ? { status: 409, json: { error: { code: 'COMMAND_IN_PROGRESS' } } } : requests.length === 3 ? { status: 429, headers: { 'Retry-After': '1' }, json: { error: { retryAfterSeconds: 90 } } } : { status: 201, json: partnerResponse() })
  })
  await openCompany(page)
  await openDialog(page)
  await fillPartner(page)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Creating account…' })).toBeDisabled()
  await expect(page.getByLabel('Initial password *')).toBeDisabled()
  release()
  await expect(page.getByRole('button', { name: 'Retry same account' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Retry same account' }).click()
  await expect(page.getByRole('button', { name: 'Retry same account' })).toBeEnabled()
  await page.getByRole('button', { name: 'Retry same account' }).click()
  await expect(page.getByRole('alert')).toContainText('Too many requests')
  await expect(page.getByRole('button', { name: 'Retry same account' })).toBeDisabled()
  await expect(page.getByLabel('Email / login *')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Retry same account' })).toBeEnabled({ timeout: 3000 })
  await page.getByRole('button', { name: 'Retry same account' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Partner account saved for' })).toBeVisible()
  expect(requests).toHaveLength(4)
  expect(requests.every((request) => JSON.stringify(request) === JSON.stringify(requests[0]))).toBe(true)
})

test('paginates scoped account totals, retains stale rows and recovers independently of the profile', async ({ page }) => {
  let hasFailure = false
  const second = { ...partnerResponse(), user: { ...partnerResponse().user, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', fullName: 'Second Synthetic Partner', email: 'second@acme.example', isActive: false } }
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}/partners?*`, (route) => route.fulfill(hasFailure ? { status: 403, json: { error: {} } } : { json: new URL(route.request().url()).searchParams.has('cursor') ? partnerList([second], 26) : partnerList([partnerResponse()], 26, 'next/account-page') }))
  await openCompany(page)
  const accounts = page.getByRole('region', { name: 'Partner accounts' })
  await expect(accounts.getByRole('table')).toContainText('Synthetic Partner')
  await expect(accounts).toContainText('26 accounts in total')
  await page.getByRole('button', { name: 'Next accounts →', exact: true }).click()
  await expect(page).toHaveURL(/partnerCursor=next%2Faccount-page/)
  await expect(accounts.getByRole('table')).toContainText('Second Synthetic Partner')
  await expect(accounts.getByRole('table')).toContainText('Inactive')
  await page.getByRole('button', { name: '← Previous accounts', exact: true }).click()
  await expect(accounts.getByRole('table')).toContainText('partner@acme.example')
  hasFailure = true
  await page.getByRole('button', { name: 'Refresh partner accounts', exact: true }).click()
  await expect(accounts.getByRole('alert')).toContainText('You do not have access')
  await expect(accounts).toContainText('may be stale')
  await expect(page.getByRole('heading', { name: 'Acme Mobility', exact: true })).toBeVisible()
  hasFailure = false
  await accounts.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(accounts.getByRole('alert')).toBeHidden()
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('keeps 403 provisioning recoverable and removes the dialog/credentials after a 401', async ({ page }) => {
  let status = 403
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}/partners`, (route) => route.fulfill({ status, json: { error: {} } }))
  await openCompany(page)
  await openDialog(page)
  await fillPartner(page)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('You do not have access')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByLabel('Email / login *')).toBeEnabled()
  status = 401
  await page.getByRole('button', { name: 'Retry account setup' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('Your session expired', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeHidden()
  expect(await page.locator('body').textContent()).not.toContain(TEST_PARTNER_PASSWORD)
})


test('isolates account lists and new credential forms when switching companies', async ({ page }) => {
  const secondId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  await page.route('**/api/v1/companies?*', (route) => route.fulfill({ json: companyList([companyResponse(), companyResponse({ id: secondId, displayName: 'Second Company' })]) }))
  await page.route(`**/api/v1/companies/${secondId}`, (route) => route.fulfill({ json: companyResponse({ id: secondId, displayName: 'Second Company' }) }))
  await page.route(`**/api/v1/companies/${secondId}/payout-rates?*`, (route) => route.fulfill({ json: rateList([]) }))
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}/partners?*`, (route) => route.fulfill({ json: partnerList() }))
  await page.route(`**/api/v1/companies/${secondId}/partners?*`, (route) => route.fulfill({ json: partnerList([]) }))
  await openCompany(page)
  await openDialog(page)
  await fillPartner(page)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('link', { name: '← Back to companies' }).click()
  await page.getByRole('link', { name: 'View Second Company' }).click()
  await expect(page.getByRole('region', { name: 'Partner accounts' })).toContainText('No partner accounts on this page.')
  await expect(page.getByRole('region', { name: 'Partner accounts' })).not.toContainText('partner@acme.example')
  await openDialog(page)
  await expect(page.getByRole('dialog')).toContainText('Account access is restricted to Second Company.')
  await expect(page.getByLabel('Initial password *')).toHaveValue('')
  await expect(page.getByLabel('Email / login *')).toHaveValue('')
})

test('shows independent partner loading and initial failure before explicit empty recovery', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let hasFailure = true
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}/partners?*`, async (route) => { await gate; await route.fulfill(hasFailure ? { status: 503, json: { error: {} } } : { json: partnerList([]) }) })
  await openCompany(page)
  const accounts = page.getByRole('region', { name: 'Partner accounts' })
  await expect(accounts.getByRole('status')).toContainText('Loading partner accounts…')
  await expect(accounts.getByText('0 accounts in total', { exact: false })).toBeHidden()
  release()
  await expect(accounts.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Acme Mobility', exact: true })).toBeVisible()
  hasFailure = false
  await accounts.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(accounts.getByRole('status')).toContainText('No partner accounts on this page.')
})
