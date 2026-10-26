import { describe, expect, it } from 'vitest'
import { companyDraft } from '../../../test/company-fixtures'
import { percentPoints, safeCompaniesReturn, splitPreview, validateCompany, validateSplit } from './company-validation'

describe('exact company payout split', () => {
  it('normalizes percentages and previews exact shares including hundredths', () => {
    expect(validateSplit(' 33.33 ', '66.67')).toEqual({ driverPercent: '33.33', companyPercent: '66.67' })
    expect(validateSplit('30', '70.0')).toEqual({ driverPercent: '30.00', companyPercent: '70.00' })
    expect(splitPreview('33.33', '66.67')).toEqual({ driver: '₹3,333.00', company: '₹6,667.00' })
    expect(splitPreview('0.01', '99.99')).toEqual({ driver: '₹1.00', company: '₹9,999.00' })
  })
  it.each(['0', '0.00', '100', '100.01', '-1', '1e1', '01', 'NaN', '', '.5', '10.001', 'Infinity'])('rejects invalid or nonpositive share %s', (value) => {
    expect(percentPoints(value)).toBeNull()
    expect(validateSplit(value, '70')).toBeNull()
  })
  it('rejects totals above or below 100 without rounding', () => {
    expect(validateSplit('33.33', '66.66')).toBeNull()
    expect(validateSplit('33.34', '66.67')).toBeNull()
    expect(splitPreview('33.33', '66.66')).toBeNull()
  })
})
describe('company intake validation', () => {
  it('trims required fields and preserves decimal-string payloads', () => {
    const result = validateCompany({ ...companyDraft(), legalName: ' Acme Legal ', driverPercent: '30', companyPercent: '70' }, true)
    expect(result.errors).toEqual({})
    expect(result.input?.legalName).toBe('Acme Legal')
    expect(result.input?.initialPayoutRate).toEqual({ driverPercent: '30.00', companyPercent: '70.00' })
  })
  it('rejects whitespace, excessive field lengths, invalid native email and an invalid split', () => {
    const result = validateCompany({ ...companyDraft(), billingAddress: '  ', contactPhone: 'x'.repeat(31), contactEmail: 'invalid', companyPercent: '69' }, false)
    expect(result.input).toBeNull()
    expect(result.errors).toHaveProperty('billingAddress')
    expect(result.errors).toHaveProperty('contactPhone')
    expect(result.errors).toHaveProperty('contactEmail')
    expect(result.errors.companyPercent).toContain('100.00%')
  })
  it.each(['https://example.test', '//example.test', '/companies/other', '/companies#x', '/companies-malicious'])('keeps return navigation inside the directory: %s', (value) => {
    expect(safeCompaniesReturn(value)).toBe('/companies')
  })
})
