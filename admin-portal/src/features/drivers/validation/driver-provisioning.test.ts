import { expect, it } from 'vitest'
import { validateDriverProvisioning } from './driver-provisioning'
import { driverInput } from '../../../test/driver-provisioning-fixtures'
const draft = () => ({ ...driverInput(), dateOfBirth: '', homeAddress: '' })
it('normalizes contact fields while preserving issued password bytes', () => { const value = { ...draft(), fullName:' Name ',email:' DRIVER@EXAMPLE.TEST ',phone:' 123 ',initialPassword:'  synthetic password  ' }; expect(validateDriverProvisioning(value,true).input).toEqual({fullName:'Name',email:'driver@example.test',phone:'123',initialPassword:value.initialPassword}) })
it.each([{phone:''},{dateOfBirth:'2001-02-29'},{dateOfBirth:'2999-01-01'},{initialPassword:'x'.repeat(14)},{homeAddress:'x'.repeat(2001)},{fullName:'bad\0name'}])('rejects invalid driver fields %j',(change)=>{expect(validateDriverProvisioning({...draft(),...change},true).input).toBeNull()})
