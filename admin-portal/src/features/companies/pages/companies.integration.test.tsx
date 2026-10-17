import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { createAdminSession, createSessionResponse } from '../../../test/auth-fixtures'
import { companyResponse, rateList } from '../../../test/company-fixtures'
import { TEST_COMPANY_ID } from '../../../test/order-fixtures'
import { renderApp } from '../../../test/render-app'

function mockCompanyFetch(status = 200, partnerStatus = 200) {
  const fetch = vi.fn(async (input: string) => {
    if (input.includes('/users/me')) return Response.json(createSessionResponse().user)
    if (input.includes('/partners')) return Response.json(partnerStatus === 200 ? { items: [], pageInfo: { totalCount: 0, hasMore: false, nextCursor: null } } : { error: {} }, { status: partnerStatus })
    if (input.includes('/payout-rates')) return Response.json(rateList())
    return Response.json(status === 200 ? companyResponse() : { error: {} }, { status })
  })
  vi.stubGlobal('fetch', fetch)
  useAuthStore.getState().establishSession(createAdminSession())
  return fetch
}
describe('protected company detail', () => {
  it('blocks invalid identities without making a company request', async () => {
    const fetch = mockCompanyFetch()
    renderApp('/companies/not-a-uuid')
    expect(await screen.findByRole('alert')).toHaveTextContent('This record is unavailable.')
    expect(fetch.mock.calls.every(([url]) => url.includes('/users/me'))).toBe(true)
  })
  it('keeps a resource-specific 403 inside the active admin session', async () => {
    mockCompanyFetch(403)
    renderApp(`/companies/${TEST_COMPANY_ID}`)
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have access')
    expect(useAuthStore.getState().session).not.toBeNull()
    expect(screen.queryByText(companyResponse().contactEmail)).not.toBeInTheDocument()
  })
  it('clears private company caches and the session on 401', async () => {
    mockCompanyFetch(401)
    const { queryClient } = renderApp(`/companies/${TEST_COMPANY_ID}`)
    queryClient.setQueryData(['companies', createAdminSession().user.email, 'old'], { private: true })
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await waitFor(() => expect(useAuthStore.getState().session).toBeNull())
    expect(queryClient.getQueryData(['companies', createAdminSession().user.email, 'old'])).toBeUndefined()
  })
  it('renders authoritative contact/split data and rejects external return links', async () => {
    mockCompanyFetch()
    renderApp(`/companies/${TEST_COMPANY_ID}?returnTo=https://example.test`)
    expect(await screen.findByText(companyResponse().contactEmail)).toBeVisible()
    expect(await screen.findByText('30.00%')).toBeVisible()
    expect(screen.getByRole('link', { name: '← Back to companies' })).toHaveAttribute('href', '/companies')
  })
  it('keeps company/rates usable while unavailable partner accounts disable provisioning', async () => {
    mockCompanyFetch(200, 404)
    renderApp(`/companies/${TEST_COMPANY_ID}`)
    expect(await screen.findByRole('alert')).toHaveTextContent('Partner accounts are currently unavailable.')
    expect(screen.getByRole('button', { name: 'Provision partner account' })).toBeDisabled()
    expect(await screen.findByText('30.00%')).toBeVisible()
    expect(screen.queryByText('No partner accounts on this page.')).not.toBeInTheDocument()
  })

})
