import { expect, it, vi } from 'vitest'
import { createDriver } from './driver-service'
import { driverInput, provisionedDriverResponse, TEST_DRIVER_PASSWORD } from '../../../test/driver-provisioning-fixtures'
it('sends only allowed creation fields and drops echoed credentials from the safe result',async()=>{
 const mock=vi.fn().mockResolvedValue(Response.json({...provisionedDriverResponse(),password:TEST_DRIVER_PASSWORD}));vi.stubGlobal('fetch',mock)
 const input=driverInput(); const result=await createDriver({...input,status:'active'} as typeof input,'intent','token')
 expect(mock.mock.calls[0][0]).toBe('/api/v1/drivers'); expect(mock.mock.calls[0][1].headers).toMatchObject({'Idempotency-Key':'intent',Authorization:'Bearer token'});expect(JSON.parse(mock.mock.calls[0][1].body)).toEqual(input);expect(JSON.stringify(result)).not.toContain(TEST_DRIVER_PASSWORD)
})
it.each([{user:{...provisionedDriverResponse().user,driverId:null}},{status:'active'},{isOnline:true},{onboardedAt:'2026-01-01T00:00:00Z'},{user:{...provisionedDriverResponse().user,passwordChangeRequired:false}},{user:{...provisionedDriverResponse().user,email:'different@example.test'}}])('rejects unsafe creation results %j',async(change)=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({...provisionedDriverResponse(),...change})));await expect(createDriver(driverInput(),'intent','token')).rejects.toMatchObject({status:502})})
