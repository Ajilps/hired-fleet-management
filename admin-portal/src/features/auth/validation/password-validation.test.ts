import { describe, expect, it } from 'vitest'
import { validatePasswordChange } from './password-validation'

const draft = { currentPassword: 'synthetic-current-password', newPassword: '  synthetic new password  ', confirmation: '  synthetic new password  ' }
describe('password change validation', () => {
  it('preserves spaces and accepts matching different passwords', () => { expect(validatePasswordChange(draft)).toEqual({}) })
  it.each([
    { currentPassword: '' }, { currentPassword: 'x'.repeat(1025) }, { newPassword: 'x'.repeat(14) }, { newPassword: 'x'.repeat(129) }, { newPassword: draft.currentPassword }, { confirmation: 'different' },
  ])('rejects invalid password input without normalizing it: %j', (extra) => { expect(Object.keys(validatePasswordChange({ ...draft, ...extra })).length).toBeGreaterThan(0) })
})
