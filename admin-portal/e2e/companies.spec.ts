import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSessionResponse } from '../src/test/auth-fixtures'
import { companyDraft, companyInput, companyList, companyResponse, rateList, rateResponse } from '../src/test/company-fixtures'
import { TEST_COMPANY_ID } from '../src/test/order-fixtures'
import { mockCurrentAdmin, mockEmptyOverview, openNavigation, signIn } from './auth-helpers'

async function openCompanies(page: Page) {
  await page.goto('/login')
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  await openNavigation(page)
  await page.getByRole('link', { name: 'Companies', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Companies', exact: true })).toBeVisible()
}
async function fillCompany(page: Page) {
  const draft = companyDraft()
  for (const [label, value] of [
    ['Legal company name *', draft.legalName], ['Display name *', draft.displayName], ['Contact name *', draft.contactName], ['Contact email *', draft.contactEmail], ['Contact phone *', draft.contactPhone], ['Billing address *', draft.billingAddress], ['Driver share · % *', '33.33'], ['Company share · % *', '66.67'],
  ]) await page.getByLabel(label, { exact: true }).fill(value)
}
async function checkWidths(page: Page) {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
}
test.beforeEach(async ({ page }) => {
  await mockCurrentAdmin(page)
  await mockEmptyOverview(page)
  await page.route('**/api/v1/auth-sessions/login', (route) => route.fulfill({ json: createSessionResponse() }))
  await page.route('**/api/v1/companies?*', (route) => route.fulfill({ json: companyList() }))
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}`, (route) => route.fulfill({ json: companyResponse() }))
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}/partners?*`, (route) => route.fulfill({ json: { items: [], pageInfo: { totalCount: 0, hasMore: false, nextCursor: null } } }))
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}/payout-rates?*`, (route) => route.fulfill({ json: rateList() }))
})

test('paginates companies, filters only loaded rows and restores the directory URL', async ({ page }, testInfo) => {
  const second = companyResponse({ id: '77777777-7777-4777-8777-777777777777', displayName: 'Northstar Logistics', isActive: false })
  const requests: URL[] = []
  await page.route('**/api/v1/companies?*', (route) => {
    const url = new URL(route.request().url()); requests.push(url)
    return route.fulfill({ json: url.searchParams.has('cursor') ? companyList([second], 26) : companyList([companyResponse()], 26, 'opaque/page-2') })
  })
  await openCompanies(page)
  await expect(page.getByRole('table')).toBeVisible()
  await page.getByLabel('Search current page').fill('acme')
  await page.getByLabel('Status · current page').selectOption('active')
  await expect(page).toHaveURL(/search=acme&status=active/)
  await expect(page.getByRole('status')).toContainText('1 shown from 1 loaded · 26 companies in total')
  await page.getByRole('link', { name: 'View Acme Mobility', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Acme Mobility', exact: true })).toBeVisible()
  await expect(page.getByText('30.00%', { exact: true })).toBeVisible()
  await expect(page.getByText('Synthetic office, Bengaluru', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '← Back to companies' }).click()
  await expect(page.getByLabel('Search current page')).toHaveValue('acme')
  await page.getByRole('button', { name: 'Next →', exact: true }).click()
  await expect(page.getByText('No companies match the current-page filters.', { exact: true })).toBeVisible()
  await expect.poll(() => requests.at(-1)?.searchParams.get('cursor')).toBe('opaque/page-2')
  expect([...requests.at(-1)!.searchParams.keys()]).toEqual(['limit', 'cursor'])
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(page.getByText('Northstar Logistics', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '← Previous', exact: true }).click()
  await expect(page.getByText('Acme Mobility', { exact: true })).toBeVisible()
  await checkWidths(page)
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.screenshot({ path: testInfo.outputPath('companies-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 1400 })
  await page.screenshot({ path: testInfo.outputPath('companies-mobile.png') })
})

test('validates required fields and exact shares, creates once and shows saved detail', async ({ page }, testInfo) => {
  let submits = 0
  await page.route('**/api/v1/companies', (route) => {
    submits++
    expect(route.request().postDataJSON()).toEqual({ ...companyInput(), initialPayoutRate: { driverPercent: '33.33', companyPercent: '66.67' } })
    expect(route.request().headers()['idempotency-key']).toBeTruthy()
    expect(route.request().headers()['if-match']).toBeUndefined()
    return route.fulfill({ status: 201, json: companyResponse() })
  })
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}/payout-rates?*`, (route) => route.fulfill({ json: rateList([rateResponse({ driverPercent: '33.33', companyPercent: '66.67' })]) }))
  await openCompanies(page)
  await page.getByRole('link', { name: 'Create company', exact: true }).click()
  await page.getByRole('button', { name: 'Create company', exact: true }).click()
  await expect(page.getByLabel('Legal company name *')).toBeFocused()
  await expect(page.getByRole('alert')).toContainText('Check the highlighted')
  await fillCompany(page)
  await page.getByLabel('Contact email *').fill('invalid')
  await page.getByRole('button', { name: 'Create company', exact: true }).click()
  await expect(page.getByLabel('Contact email *')).toBeFocused()
  await page.getByLabel('Contact email *').fill(companyDraft().contactEmail)
  await page.getByLabel('Company share · % *').fill('66.66')
  await page.getByRole('button', { name: 'Create company', exact: true }).click()
  await expect(page.getByText('Driver and company shares must total exactly 100.00%.', { exact: true })).toBeVisible()
  expect(submits).toBe(0)
  await page.getByLabel('Company share · % *').fill('66.67')
  await expect(page.getByText('₹10,000.00 trip → ₹3,333.00 driver + ₹6,667.00 company.', { exact: true })).toBeVisible()
  await checkWidths(page)
  await page.setViewportSize({ width: 1440, height: 1200 })
  await page.screenshot({ path: testInfo.outputPath('create-company-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 1800 })
  await page.screenshot({ path: testInfo.outputPath('create-company-mobile.png') })
  await page.getByRole('button', { name: 'Create company', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Company and initial payout split saved.' })).toBeVisible()
  await expect(page.getByText('33.33%', { exact: true })).toBeVisible()
  expect(submits).toBe(1)
  await expect(page.getByRole('link', { name: 'View company orders' })).toHaveAttribute('href', `/orders?companyId=${TEST_COMPANY_ID}`)
  await checkWidths(page)
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.screenshot({ path: testInfo.outputPath('company-detail-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 1700 })
  await page.screenshot({ path: testInfo.outputPath('company-detail-mobile.png') })
})

test('locks interrupted creation and retries the same request through throttling', async ({ page }) => {
  const commands: { key: string; body: string | null }[] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/v1/companies', async (route) => {
    commands.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() })
    if (commands.length === 1) { await gate; await route.abort('failed'); return }
    if (commands.length === 2) { await route.fulfill({ status: 429, headers: { 'Retry-After': '1' }, json: { error: { retryAfterSeconds: 90 } } }); return }
    await route.fulfill({ status: 201, json: companyResponse() })
  })
  await openCompanies(page)
  await page.getByRole('link', { name: 'Create company', exact: true }).click()
  await fillCompany(page)
  await page.getByRole('button', { name: 'Create company', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Saving company…' })).toBeDisabled()
  await expect(page.getByLabel('Legal company name *')).toBeDisabled()
  release()
  await expect(page.getByRole('status').filter({ hasText: 'The save outcome is unknown.' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry same company' }).click()
  await expect(page.getByRole('alert')).toContainText('Too many requests')
  await expect(page.getByRole('button', { name: 'Retry same company' })).toBeDisabled()
  await expect(page.getByLabel('Legal company name *')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Retry same company' })).toBeEnabled({ timeout: 3000 })
  await page.getByRole('button', { name: 'Retry same company' }).click()
  await expect(page.getByRole('heading', { name: 'Acme Mobility', exact: true })).toBeVisible()
  expect(commands).toHaveLength(3)
  expect(commands[0]).toEqual(commands[1])
  expect(commands[0]).toEqual(commands[2])
})

test('preserves editable form input after a definitive failure', async ({ page }) => {
  let submits = 0
  const keys: string[] = []
  await page.route('**/api/v1/companies', (route) => {
    keys.push(route.request().headers()['idempotency-key'])
    return route.fulfill(++submits === 1 ? { status: 422, json: { error: {} } } : { status: 201, json: companyResponse() })
  })
  await openCompanies(page)
  await page.getByRole('link', { name: 'Create company', exact: true }).click()
  await fillCompany(page)
  await page.getByRole('button', { name: 'Create company', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Check the entered values')
  await expect(page.getByLabel('Contact email *')).toHaveValue(companyDraft().contactEmail)
  await expect(page.getByLabel('Legal company name *')).toBeEnabled()
  await page.getByLabel('Driver share · % *').fill('30')
  await page.getByLabel('Company share · % *').fill('70')
  await page.getByRole('button', { name: 'Create company', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Acme Mobility', exact: true })).toBeVisible()
  expect(keys[0]).not.toBe(keys[1])
})

test('handles loading, stale refresh failure, empty recovery and payout-only errors', async ({ page }) => {
  let fail = false
  let empty = false
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/v1/companies?*', async (route) => {
    await gate
    await route.fulfill(fail ? { status: 503, json: { error: {} } } : { json: empty ? companyList([]) : companyList() })
  })
  await openCompanies(page)
  await expect(page.getByRole('status')).toContainText('Loading companies…')
  release()
  await expect(page.getByRole('link', { name: 'View Acme Mobility' })).toBeVisible()
  fail = true
  await page.getByRole('button', { name: 'Refresh companies' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('These company records are from the previous successful load and may be stale.', { exact: true })).toBeVisible()
  fail = false; empty = true
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByText('No companies on this page. Create a company to get started.', { exact: true })).toBeVisible()
  empty = false
  await page.getByRole('button', { name: 'Refresh companies' }).click()
  await expect(page.getByRole('link', { name: 'View Acme Mobility' })).toBeVisible()
  let rateFail = true
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}/payout-rates?*`, (route) => route.fulfill(rateFail ? { status: 403, json: { error: {} } } : { json: rateList() }))
  await page.getByRole('link', { name: 'View Acme Mobility' }).click()
  await expect(page.getByRole('alert')).toContainText('You do not have access')
  await expect(page.getByText('Synthetic Contact', { exact: true })).toBeVisible()
  rateFail = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByText('30.00%', { exact: true })).toBeVisible()
})

test('checks older rate pages without treating a historical split as current', async ({ page }) => {
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}/payout-rates?*`, (route) => route.fulfill({ json: new URL(route.request().url()).searchParams.has('cursor') ? rateList() : rateList([rateResponse({ id: '88888888-8888-4888-8888-888888888888', effectiveFrom: '2026-10-01T00:00:00Z', effectiveTo: '2026-10-15T20:00:00Z', driverPercent: '25.00', companyPercent: '75.00' })], 'older-rates') }))
  await openCompanies(page)
  await page.getByRole('link', { name: 'View Acme Mobility' }).click()
  await expect(page.getByText('No current payout split on the loaded history pages.', { exact: true })).toBeVisible()
  await expect(page.getByText('25.00%', { exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'Check older rate records' }).click()
  await expect(page.getByText('30.00%', { exact: true })).toBeVisible()
})

test('handles unavailable details and clears company data after an authenticated 401', async ({ page }) => {
  let responseStatus = 404
  await page.route(`**/api/v1/companies/${TEST_COMPANY_ID}`, (route) => route.fulfill({ status: responseStatus, json: { error: {} } }))
  await openCompanies(page)
  await page.getByRole('link', { name: 'View Acme Mobility' }).click()
  await expect(page.getByRole('alert')).toContainText('This record is unavailable.')
  responseStatus = 401
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('Your session expired', { exact: true })).toBeVisible()
  await expect(page.getByText('contact@acme.example', { exact: true })).toBeHidden()
})
