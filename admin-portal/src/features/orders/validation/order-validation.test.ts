import { describe, expect, it } from 'vitest'
import { dateBoundary, filtersFromParams, istDateTime, normalizeAmount, safeOrdersReturn, validateFilters } from './order-validation'

describe('order input and URL boundaries', () => {
  it.each([['0', '0.00'], ['9999999999.99', '9999999999.99'], ['12.3', '12.30'], [' 10000 ', '10000.00']])('normalizes %s exactly to %s', (value, expected) => expect(normalizeAmount(value)).toBe(expected))
  it.each(['-1', '1e3', '01.00', '1.001', '10000000000', 'NaN', '1,000.00'])('rejects an invalid contract amount %s', (value) => expect(normalizeAmount(value)).toBeNull())
  it('uses explicit IST rather than the browser timezone and accepts leap days', () => {
    expect(istDateTime('2028-02-29T00:15')).toBe('2028-02-29T00:15:00+05:30')
    expect(new Date(istDateTime('2028-02-29T00:15')!).toISOString()).toBe('2028-02-28T18:45:00.000Z')
    expect(istDateTime('2026-02-29T12:00')).toBeNull()
    expect(istDateTime('2026-10-16T24:00')).toBeNull()
  })
  it('makes the end date exclusive at the following local midnight, across year boundaries', () => {
    expect(dateBoundary('2026-12-31', true)).toBe('2027-01-01T00:00:00+05:30')
    expect(dateBoundary('2028-02-29', true)).toBe('2028-03-01T00:00:00+05:30')
    expect(dateBoundary('2026-10-16')).toBe('2026-10-16T00:00:00+05:30')
  })
  it.each(['status=unknown', 'companyId=wrong', 'from=2026-02-30', 'from=2026-10-17&to=2026-10-16', 'source=unknown'])('rejects invalid shared filters: %s', (search) => expect(validateFilters(filtersFromParams(new URLSearchParams(search)))).not.toBeNull())
  it('limits return links to the order directory', () => {
    expect(safeOrdersReturn('https://example.test')).toBe('/orders')
    expect(safeOrdersReturn('//example.test')).toBe('/orders')
    expect(safeOrdersReturn('/orders/evil')).toBe('/orders')
    expect(safeOrdersReturn('/orders?status=received')).toBe('/orders?status=received')
  })
})
