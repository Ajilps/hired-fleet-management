import { screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { createAdminSession, createSessionResponse } from '../../../test/auth-fixtures'
import { driverInput, provisionedDriverResponse, TEST_DRIVER_PASSWORD } from '../../../test/driver-provisioning-fixtures'
import { renderApp } from '../../../test/render-app'
function mock() { const fetch=vi.fn(async(url:string,init?:RequestInit)=>{ if(url.includes('/users/me'))return Response.json(createSessionResponse().user);if(init?.method==='POST')return Response.json(provisionedDriverResponse());if(url.includes('/documents')||url.includes('/availability'))return Response.json({error:{}},{status:404});return Response.json(provisionedDriverResponse()) });vi.stubGlobal('fetch',fetch);useAuthStore.getState().establishSession(createAdminSession());return fetch }
it('guards the creation route before requesting private data',async()=>{vi.stubGlobal('fetch',vi.fn());renderApp('/drivers/new');expect(await screen.findByRole('heading',{name:'Welcome back'})).toBeVisible()})
it('focuses invalid input, creates a pending account and clears credential state',async()=>{
 const fetch=mock();const {user,queryClient}=renderApp('/drivers/new');await screen.findByRole('heading',{name:'Create driver account'});await user.click(screen.getByRole('button',{name:'Create driver account'}));expect(screen.getByLabelText('Driver name *')).toHaveFocus()
 const input=driverInput();for(const [label,value]of [['Driver name *',input.fullName],['Email / login *',input.email],['Phone *',input.phone],['Initial password *',input.initialPassword]])await user.type(screen.getByLabelText(label),value)
 expect(screen.getByLabelText('Initial password *')).toHaveAttribute('type','password');await user.click(screen.getByRole('button',{name:'Create driver account'}));expect(await screen.findByText('Driver account created. Password setup and operational activation are still required.')).toBeVisible()
 const call=fetch.mock.calls.find(([,init])=>init?.method==='POST');expect(JSON.parse(call![1]!.body as string)).toEqual(input);await waitFor(()=>expect(queryClient.getMutationCache().getAll()).toHaveLength(0));expect(JSON.stringify(queryClient.getQueryCache().getAll().map((query)=>query.state.data))).not.toContain(TEST_DRIVER_PASSWORD)
})
