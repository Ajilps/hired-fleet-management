import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSessionResponse } from '../src/test/auth-fixtures'
import { activatedDriverResponse, ACTIVATION_DRIVER_ID } from '../src/test/driver-activation-fixtures'
import { allDriverDocuments, driverDocumentList, fileAssetResponse } from '../src/test/driver-document-fixtures'
import { driverList, pendingDriverResponse } from '../src/test/driver-fixtures'
import { mockCurrentAdmin, mockEmptyDriverCalendars, mockEmptyOverview, openNavigation, signIn } from './auth-helpers'

const currentDocuments = () => allDriverDocuments().map((document) => ({ ...document, driverId: ACTIVATION_DRIVER_ID }))
async function openApplication(page: Page) {
  await page.goto('/login'); await signIn(page)
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  await openNavigation(page); await page.getByRole('link', { name: 'Drivers', exact: true }).click()
  await page.getByRole('button', { name: 'Pending', exact: true }).click()
  await page.getByRole('link', { name: 'View Pending Applicant' }).click()
  await expect(page.getByRole('heading', { name: 'Pending Applicant', exact: true })).toBeVisible()
}
async function openConfirmation(page: Page) {
  await expect(page.getByRole('button', { name: 'Activate driver', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Activate driver', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Confirm operational activation' })).toBeVisible()
}
async function checkWidths(page: Page) {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const dialog = page.getByRole('dialog')
    if (await dialog.isVisible()) expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  }
}
test.beforeEach(async ({ page }) => {
  await mockCurrentAdmin(page); await mockEmptyOverview(page)
  await mockEmptyDriverCalendars(page)
  await page.route('**/api/v1/auth-sessions/login', (route) => route.fulfill({ json: createSessionResponse() }))
  await page.route('**/api/v1/drivers?*', (route) => route.fulfill({ json: driverList(new URL(route.request().url()).searchParams.get('status') === 'pending' ? [pendingDriverResponse()] : []) }))
  await page.route(`**/api/v1/drivers/${ACTIVATION_DRIVER_ID}`, (route) => route.fulfill({ json: pendingDriverResponse() }))
  await page.route('**/api/v1/drivers/*/documents?*', (route) => route.fulfill({ json: driverDocumentList(currentDocuments()) }))
  await page.route('**/api/v1/file-assets/*', (route) => route.fulfill({ json: fileAssetResponse({ id: new URL(route.request().url()).pathname.split('/').at(-1) }) }))
})

test('confirms activation with a required reason, blocks duplicate saves and shows authoritative history without changing availability', async ({ page }, testInfo) => {
  let activated = false
  let commands = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route(`**/api/v1/drivers/${ACTIVATION_DRIVER_ID}`, (route) => route.fulfill({ json: activated ? activatedDriverResponse() : pendingDriverResponse() }))
  await page.route('**/api/v1/drivers?*', (route) => {
    const status = new URL(route.request().url()).searchParams.get('status')
    return route.fulfill({ json: driverList(status === 'pending' && !activated ? [pendingDriverResponse()] : status === 'active' && activated ? [activatedDriverResponse()] : []) })
  })
  await page.route(`**/api/v1/drivers/${ACTIVATION_DRIVER_ID}/status`, async (route) => {
    commands++
    expect(route.request().method()).toBe('PATCH')
    expect(route.request().headers()['idempotency-key']).toBeTruthy()
    expect(route.request().headers()['if-match']).toBeUndefined()
    expect(route.request().postDataJSON()).toEqual({ status: 'active', reason: 'Operational onboarding complete' })
    await gate; activated = true; await route.fulfill({ json: activatedDriverResponse() })
  })
  await openApplication(page)
  await expect(page.getByText('All four current uploads have clean safety scans.', { exact: true })).toBeVisible()
  await checkWidths(page)
  await page.setViewportSize({ width: 1440, height: 1400 })
  await page.screenshot({ path: testInfo.outputPath('activation-ready-desktop.png'), fullPage: true })
  await openConfirmation(page)
  const dialog = page.getByRole('dialog', { name: 'Confirm operational activation' })
  await expect(page.getByLabel('Activation reason *')).toBeFocused()
  await page.getByRole('button', { name: 'Confirm activation', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Enter an activation reason')
  expect(commands).toBe(0)
  await page.getByLabel('Activation reason *').fill('  Operational onboarding complete  ')
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab')
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true)
  await checkWidths(page)
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.screenshot({ path: testInfo.outputPath('activate-driver-desktop.png') })
  await page.setViewportSize({ width: 390, height: 1100 })
  await page.screenshot({ path: testInfo.outputPath('activate-driver-mobile.png') })
  await page.getByRole('button', { name: 'Confirm activation', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Activating…', exact: true })).toBeDisabled()
  await expect(page.getByLabel('Activation reason *')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible()
  release()
  await expect(page.getByText('Driver activation saved. Online status and calendar availability remain separate.', { exact: true })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('17 Oct 2026, 1:30 pm', { exact: true })).toHaveCount(2)
  await expect(page.getByText('Offline', { exact: true })).toBeVisible()
  expect(commands).toBe(1)
  await page.getByRole('link', { name: '← Back to drivers' }).click()
  await expect(page.getByText('No drivers on this page for the selected filters.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Active', exact: true }).click()
  await expect(page.getByRole('link', { name: 'View Pending Applicant' })).toBeVisible()
})

test('blocks disabled accounts, missing uploads and pending/rejected scans until refreshed', async ({ page }) => {
  let enabled = false
  let ready = false
  await page.route(`**/api/v1/drivers/${ACTIVATION_DRIVER_ID}`, (route) => route.fulfill({ json: { ...pendingDriverResponse(), user: { ...pendingDriverResponse().user, isActive: enabled } } }))
  await page.route('**/api/v1/drivers/*/documents?*', (route) => route.fulfill({ json: driverDocumentList(ready ? currentDocuments() : currentDocuments().slice(0, 3)) }))
  await page.route('**/api/v1/file-assets/*', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!
    return route.fulfill({ json: fileAssetResponse({ id, scanStatus: ready ? 'clean' : id.endsWith('1') ? 'pending' : id.endsWith('3') ? 'rejected' : 'clean' }) })
  })
  await openApplication(page)
  await expect(page.getByText('The user account must be enabled before activation.', { exact: true })).toBeVisible()
  for (const blocker of ['Driving Licence: safety scan pending.', 'PAN: safety scan rejected.', 'PCC: current upload missing.']) await expect(page.getByText(blocker, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Activate driver', exact: true })).toBeDisabled()
  enabled = true; ready = true
  await page.getByRole('button', { name: 'Refresh activation check', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Activate driver', exact: true })).toBeEnabled()
  await openConfirmation(page)
  await page.getByLabel('Activation reason *').fill('Canceled draft')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Activate driver', exact: true })).toBeFocused()
  await openConfirmation(page)
  await expect(page.getByLabel('Activation reason *')).toHaveValue('')
})

test('replays uncertain activation with the same reason/key through in-progress, throttling and malformed success', async ({ page }) => {
  const commands: { key: string; body: string | null }[] = []
  let reads = 0
  await page.route('**/api/v1/drivers/*/documents?*', (route) => { reads++; return route.fulfill({ json: driverDocumentList(currentDocuments()) }) })
  await page.route(`**/api/v1/drivers/${ACTIVATION_DRIVER_ID}/status`, (route) => {
    commands.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() })
    if (commands.length === 1) return route.abort('failed')
    if (commands.length === 2) return route.fulfill({ status: 409, json: { error: { code: 'COMMAND_IN_PROGRESS' } } })
    if (commands.length === 3) return route.fulfill({ status: 429, headers: { 'Retry-After': '1' }, json: { error: {} } })
    if (commands.length === 4) return route.fulfill({ json: activatedDriverResponse({ activatedByUserId: null }) })
    return route.fulfill({ json: activatedDriverResponse() })
  })
  await openApplication(page); await openConfirmation(page)
  await page.getByLabel('Activation reason *').fill('Original reason')
  await page.getByRole('button', { name: 'Confirm activation', exact: true }).click()
  await expect(page.getByText(/The activation outcome is unknown/)).toBeVisible()
  const initialReads = reads
  await expect(page.getByLabel('Activation reason *')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Retry same activation' }).click()
  await expect.poll(() => commands.length).toBe(2)
  await page.getByRole('button', { name: 'Retry same activation' }).click()
  await expect(page.getByRole('alert')).toContainText('Too many requests')
  await expect(page.getByRole('button', { name: 'Retry same activation' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Retry same activation' })).toBeEnabled({ timeout: 3000 })
  await page.getByRole('button', { name: 'Retry same activation' }).click()
  await expect(page.getByRole('alert')).toContainText('unexpected response')
  expect(reads).toBe(initialReads)
  await page.getByRole('button', { name: 'Retry same activation' }).click()
  await expect(page.getByText(/Driver activation saved/)).toBeVisible()
  expect(commands).toHaveLength(5)
  expect(new Set(commands.map((command) => command.key)).size).toBe(1)
  expect(new Set(commands.map((command) => command.body)).size).toBe(1)
})

test('requires refreshed review after a definitive conflict and sends a new command identity', async ({ page }) => {
  const commands: { key: string; body: string | null }[] = []
  let scanStatus = 'clean'
  await page.route('**/api/v1/file-assets/*', (route) => route.fulfill({ json: fileAssetResponse({ id: new URL(route.request().url()).pathname.split('/').at(-1), scanStatus }) }))
  await page.route(`**/api/v1/drivers/${ACTIVATION_DRIVER_ID}/status`, (route) => {
    commands.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() })
    return route.fulfill(commands.length === 1 ? { status: 409, json: { error: {} } } : { json: activatedDriverResponse() })
  })
  await openApplication(page); await openConfirmation(page)
  const dialog = page.getByRole('dialog')
  await page.getByLabel('Activation reason *').fill('First reason')
  await page.getByRole('button', { name: 'Confirm activation', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('conflicts with the current record')
  await expect(page.getByRole('button', { name: 'Confirm activation', exact: true })).toBeDisabled()
  scanStatus = 'rejected'
  await dialog.getByRole('button', { name: 'Refresh activation check', exact: true }).click()
  await expect(dialog.getByText('PCC: safety scan rejected.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm activation', exact: true })).toBeDisabled()
  scanStatus = 'clean'
  await dialog.getByRole('button', { name: 'Refresh activation check', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirm activation', exact: true })).toBeEnabled()
  await page.getByLabel('Activation reason *').fill('Reviewed current uploads')
  await page.getByRole('button', { name: 'Confirm activation', exact: true }).click()
  await expect(page.getByText(/Driver activation saved/)).toBeVisible()
  expect(commands).toHaveLength(2)
  expect(commands[0].key).not.toBe(commands[1].key)
})

test('rechecks changed uploads before dispatch and never writes an incomplete activation', async ({ page }) => {
  let complete = true
  let commands = 0
  await page.route('**/api/v1/drivers/*/documents?*', (route) => route.fulfill({ json: driverDocumentList(complete ? currentDocuments() : currentDocuments().slice(0, 3)) }))
  await page.route(`**/api/v1/drivers/${ACTIVATION_DRIVER_ID}/status`, (route) => { commands++; return route.fulfill({ json: activatedDriverResponse() }) })
  await openApplication(page); await openConfirmation(page)
  await page.getByLabel('Activation reason *').fill('Reason preserved')
  complete = false
  await page.getByRole('button', { name: 'Confirm activation', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('PCC: current upload missing.')
  expect(commands).toBe(0)
  await expect(page.getByLabel('Activation reason *')).toHaveValue('Reason preserved')
  complete = true
  await page.getByRole('dialog').getByRole('button', { name: 'Refresh activation check', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirm activation', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Confirm activation', exact: true }).click()
  await expect(page.getByText(/Driver activation saved/)).toBeVisible()
  expect(commands).toBe(1)
})

test('keeps preflight failure and resource-specific 403 recoverable, then clears session on PATCH 401', async ({ page }) => {
  let failRead = false
  let patchStatus = 403
  await page.route(`**/api/v1/drivers/${ACTIVATION_DRIVER_ID}`, (route) => route.fulfill(failRead ? { status: 503, json: { error: {} } } : { json: pendingDriverResponse() }))
  await page.route(`**/api/v1/drivers/${ACTIVATION_DRIVER_ID}/status`, (route) => route.fulfill({ status: patchStatus, json: { error: {} } }))
  await openApplication(page); await openConfirmation(page)
  await page.getByLabel('Activation reason *').fill('Operational reason')
  failRead = true
  await page.getByRole('button', { name: 'Confirm activation', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Unable to load')
  await expect(page.getByText(/The activation outcome is unknown/)).toHaveCount(0)
  failRead = false
  await page.getByRole('dialog').getByRole('button', { name: 'Refresh activation check', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirm activation', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Confirm activation', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('You do not have access')
  await expect(page.getByRole('dialog')).toBeVisible()
  patchStatus = 401
  await page.getByRole('dialog').getByRole('button', { name: 'Refresh activation check', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirm activation', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Confirm activation', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('aborts on navigation and ignores a late activation response', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let requested = false
  await page.route(`**/api/v1/drivers/${ACTIVATION_DRIVER_ID}/status`, async (route) => { requested = true; await gate; await route.fulfill({ json: activatedDriverResponse() }).catch(() => undefined) })
  await openApplication(page); await openConfirmation(page)
  await page.getByLabel('Activation reason *').fill('Reason')
  await page.getByRole('button', { name: 'Confirm activation', exact: true }).click()
  await expect.poll(() => requested).toBe(true)
  await page.goBack()
  release()
  await expect(page.getByRole('heading', { name: 'Drivers', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(/Driver activation saved/)).toHaveCount(0)
})
