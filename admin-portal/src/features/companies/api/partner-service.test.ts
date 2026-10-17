import { describe, expect, it, vi } from 'vitest'
import { TEST_COMPANY_ID } from '../../../test/order-fixtures'
import { partnerInput, partnerList, partnerResponse, TEST_PARTNER_PASSWORD } from '../../../test/partner-fixtures'
import { createCompanyPartner, listCompanyPartners } from './partner-service'

function mockResponse(body: unknown, init?: ResponseInit) { const fetch = vi.fn().mockResolvedValue(Response.json(body, init)); vi.stubGlobal('fetch', fetch); return fetch }
const signal = () => new AbortController().signal
describe('company-scoped partner API', () => {
  it('sends only supported cursor parameters within the selected company and reads whole totals', async () => {
    const fetch = mockResponse(partnerList([partnerResponse()], 50, 'next'))
    const result = await listCompanyPartners(TEST_COMPANY_ID, 'opaque/a?b', 'token', signal())
    const url = new URL(fetch.mock.calls[0][0], 'https://example.test')
    expect(url.pathname).toBe(`/api/v1/companies/${TEST_COMPANY_ID}/partners`)
    expect([...url.searchParams]).toEqual([['limit', '25'], ['cursor', 'opaque/a?b']])
    expect(result.pageInfo.totalCount).toBe(50)
  })
  it.each(['wrapper', 'user', 'role', 'driver'])('rejects a wrong membership or account type: %s', async (kind) => {
    const row = partnerResponse()
    const otherId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    if (kind === 'wrapper') row.companyId = otherId
    if (kind === 'user') row.user.companyId = otherId
    if (kind === 'role') row.user.role = 'admin'
    const response = kind === 'driver' ? { ...row, user: { ...row.user, driverId: otherId } } : row
    mockResponse(partnerList([response]))
    await expect(listCompanyPartners(TEST_COMPANY_ID, '', 'token', signal())).rejects.toMatchObject({ status: 502 })
  })
  it.each([{ email: 'invalid' }, { isActive: 'true' }, { phone: '' }, { fullName: ' ' }, { createdAt: '2026-02-30T00:00:00Z' }])('rejects malformed user fields %j', async (changes) => {
    const row = partnerResponse()
    mockResponse({ ...row, user: { ...row.user, ...changes } })
    await expect(createCompanyPartner(TEST_COMPANY_ID, partnerInput(), 'key', 'token')).rejects.toMatchObject({ status: 502 })
  })
  it('rejects repeated rows and cursor loops', async () => {
    mockResponse(partnerList([partnerResponse(), partnerResponse()]))
    await expect(listCompanyPartners(TEST_COMPANY_ID, '', 'token', signal())).rejects.toMatchObject({ status: 502 })
    mockResponse(partnerList([partnerResponse()], 2, 'same'))
    await expect(listCompanyPartners(TEST_COMPANY_ID, 'same', 'token', signal())).rejects.toMatchObject({ status: 502 })
  })
  it('whitelists create fields and credentials only in the request body with no If-Match', async () => {
    const fetch = mockResponse(partnerResponse(), { status: 201 })
    await createCompanyPartner(TEST_COMPANY_ID, { ...partnerInput(), role: 'admin', companyId: 'wrong' } as ReturnType<typeof partnerInput>, 'same-command', 'token')
    expect(fetch.mock.calls[0][0]).toBe(`/api/v1/companies/${TEST_COMPANY_ID}/partners`)
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify(partnerInput()), headers: { Authorization: 'Bearer token', 'Idempotency-Key': 'same-command' } })
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('If-Match')
    expect(fetch.mock.calls[0][0]).not.toContain(TEST_PARTNER_PASSWORD)
  })
  it('discards echoed secrets and undeclared account fields from returned data', async () => {
    const row = partnerResponse()
    mockResponse({ ...row, initialPassword: TEST_PARTNER_PASSWORD, user: { ...row.user, password: TEST_PARTNER_PASSWORD, accessToken: 'not-retained' } })
    const result = await createCompanyPartner(TEST_COMPANY_ID, partnerInput(), 'key', 'token')
    expect(JSON.stringify(result)).not.toContain(TEST_PARTNER_PASSWORD)
    expect(result.user).not.toHaveProperty('accessToken')
  })
  it('does not confirm success for a mismatched saved identity/contact', async () => {
    const row = partnerResponse()
    mockResponse({ ...row, user: { ...row.user, email: 'different@acme.example' } })
    await expect(createCompanyPartner(TEST_COMPANY_ID, partnerInput(), 'key', 'token')).rejects.toMatchObject({ status: 502 })
  })
  it('blocks invalid company paths without a request', async () => {
    const fetch = mockResponse(partnerResponse())
    await expect(createCompanyPartner('../other-company', partnerInput(), 'key', 'token')).rejects.toMatchObject({ status: 400 })
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([401, 403, 404, 422, 429])('propagates provisioning failure %s', async (status) => {
    mockResponse({ error: { retryAfterSeconds: 10 } }, { status })
    await expect(createCompanyPartner(TEST_COMPANY_ID, partnerInput(), 'key', 'token')).rejects.toMatchObject({ status })
  })
  it('distinguishes account conflicts from an in-progress command', async () => {
    mockResponse({ error: { code: 'DUPLICATE_EMAIL' } }, { status: 409 })
    await expect(createCompanyPartner(TEST_COMPANY_ID, partnerInput(), 'key', 'token')).rejects.toMatchObject({ status: 409, message: expect.stringContaining('review the email') })
    mockResponse({ error: { code: 'COMMAND_IN_PROGRESS' } }, { status: 409 })
    await expect(createCompanyPartner(TEST_COMPANY_ID, partnerInput(), 'key', 'token')).rejects.toMatchObject({ code: 'COMMAND_IN_PROGRESS' })
  })
})
