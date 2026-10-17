import { describe, expect, it, vi } from 'vitest'
import { companyInput, companyList, companyResponse, rateList, rateResponse } from '../../../test/company-fixtures'
import { TEST_COMPANY_ID } from '../../../test/order-fixtures'
import { createCompany, getCompany, listCompanies, listCompanyRates } from './company-service'

const signal = () => new AbortController().signal
function mockResponse(body: unknown, init?: ResponseInit) { const mock = vi.fn().mockResolvedValue(Response.json(body, init)); vi.stubGlobal('fetch', mock); return mock }
describe('company API contract', () => {
  it('sends documented pagination only and preserves opaque cursors and full totals', async () => {
    const mock = mockResponse(companyList([companyResponse()], 50, 'next-page'))
    const result = await listCompanies('a/b?c', 'token', signal())
    const url = new URL(mock.mock.calls[0][0], 'https://example.test')
    expect([...url.searchParams]).toEqual([['limit', '25'], ['cursor', 'a/b?c']])
    expect(result.pageInfo.totalCount).toBe(50)
    expect(mock.mock.calls[0][1].headers.Authorization).toBe('Bearer token')
  })
  it.each([{ contactName: '' }, { legalName: null }, { isActive: 'true' }, { contactEmail: 'bad email' }, { createdAt: '2026-02-30T00:00:00Z' }, { contactPhone: 'x'.repeat(31) }])('rejects malformed company fields %j', async (fields) => {
    mockResponse({ ...companyResponse(), ...fields })
    await expect(getCompany(TEST_COMPANY_ID, 'token', signal())).rejects.toMatchObject({ status: 502 })
  })
  it('rejects a different detail identity', async () => {
    mockResponse(companyResponse({ id: '99999999-9999-4999-8999-999999999999' }))
    await expect(getCompany(TEST_COMPANY_ID, 'token', signal())).rejects.toMatchObject({ status: 502 })
  })
  it('rejects duplicate rows and a repeated pagination cursor', async () => {
    mockResponse(companyList([companyResponse(), companyResponse()]))
    await expect(listCompanies('', 'token', signal())).rejects.toMatchObject({ status: 502 })
    mockResponse(companyList([companyResponse()], 2, 'same'))
    await expect(listCompanies('same', 'token', signal())).rejects.toMatchObject({ status: 502 })
  })
  it('creates company and initial split in one idempotent command without If-Match', async () => {
    const mock = mockResponse(companyResponse(), { status: 201 })
    const input = companyInput()
    await expect(createCompany(input, 'same-key', 'token')).resolves.toEqual(companyResponse())
    expect(mock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify(input), headers: { 'Idempotency-Key': 'same-key' } })
    expect(mock.mock.calls[0][1].headers).not.toHaveProperty('If-Match')
  })
  it('treats an unrelated saved response as an unknown outcome', async () => {
    mockResponse(companyResponse({ legalName: 'Different Company' }), { status: 201 })
    await expect(createCompany(companyInput(), 'key', 'token')).rejects.toMatchObject({ status: 502 })
  })
  it.each([401, 403, 404, 429])('propagates protected read failure %s', async (status) => {
    mockResponse({ error: { retryAfterSeconds: 10 } }, { status })
    await expect(getCompany(TEST_COMPANY_ID, 'token', signal())).rejects.toMatchObject({ status })
  })
  it('reads payout rates separately from company data', async () => {
    const mock = mockResponse(rateList())
    const result = await listCompanyRates(TEST_COMPANY_ID, '', 'token', signal())
    expect(mock.mock.calls[0][0]).toBe(`/api/v1/companies/${TEST_COMPANY_ID}/payout-rates?limit=25`)
    expect(result.items[0]).toMatchObject({ driverPercent: '30.00', companyPercent: '70.00' })
  })
  it.each([{ driverPercent: '30' }, { driverPercent: '0.00', companyPercent: '100.00' }, { companyPercent: '69.99' }, { companyId: '99999999-9999-4999-8999-999999999999' }, { effectiveTo: '2026-10-14T00:00:00Z' }])('rejects invalid payout data %j', async (rate) => {
    mockResponse(rateList([rateResponse(rate)]))
    await expect(listCompanyRates(TEST_COMPANY_ID, '', 'token', signal())).rejects.toMatchObject({ status: 502 })
  })
})
