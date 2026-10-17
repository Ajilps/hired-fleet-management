import { describe, expect, it } from 'vitest'
import { partnerInput } from '../../../test/partner-fixtures'
import { validatePartner } from './partner-validation'

const draft = () => ({ ...partnerInput(), phone: '' })
describe('partner intake validation', () => {
  it('normalizes identity fields, omits an empty optional phone and preserves the exact password', () => {
    const result = validatePartner({ ...draft(), fullName: ' Synthetic Partner ', email: ' partner@acme.example ', initialPassword: '  opaque password  ' }, true)
    expect(result.input).toEqual({ ...partnerInput(), initialPassword: '  opaque password  ' })
    expect(result.input).not.toHaveProperty('phone')
  })
  it.each([
    ['fullName', '   '], ['fullName', 'x'.repeat(151)], ['email', 'x'.repeat(256)], ['phone', 'x'.repeat(31)], ['initialPassword', ''], ['initialPassword', 'x'.repeat(1025)],
  ])('rejects invalid %s', (field, value) => {
    const result = validatePartner({ ...draft(), [field]: value }, true)
    expect(result.input).toBeNull()
    expect(result.errors).toHaveProperty(field)
  })
  it('uses native email syntax feedback and preserves optional contact selection', () => {
    expect(validatePartner(draft(), false).errors.email).toBeTruthy()
    expect(validatePartner({ ...draft(), phone: ' +919800000001 ', isPrimaryContact: true }, true).input).toMatchObject({ phone: '+919800000001', isPrimaryContact: true })
  })
})
