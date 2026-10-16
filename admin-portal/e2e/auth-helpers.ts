import type { Page } from '@playwright/test'
import { createSessionResponse, TEST_EMAIL, TEST_PASSWORD } from '../src/test/auth-fixtures'
import { createOverviewList } from '../src/test/overview-fixtures'

export async function mockEmptyCompanies(page: Page) {
  await page.route('**/api/v1/companies?*', (route) => route.fulfill({ json: { items: [], pageInfo: { totalCount: 0, hasMore: false, nextCursor: null } } }))
}

export async function mockEmptyOverview(page: Page) {
  for (const path of ['orders', 'trips', 'statements']) {
    await page.route(`**/api/v1/${path}?*`, (route) => {
      const status = new URL(route.request().url()).searchParams.get('status')!
      return route.fulfill({ json: createOverviewList(status) })
    })
  }
}

export async function mockCurrentAdmin(page: Page) {
  await page.route('**/api/v1/users/me', (route) => route.fulfill({ status: 200, json: createSessionResponse().user }))
}

export async function signIn(page: Page) {
  await page.getByLabel('Email address').fill(TEST_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

export async function openNavigation(page: Page) {
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
}
