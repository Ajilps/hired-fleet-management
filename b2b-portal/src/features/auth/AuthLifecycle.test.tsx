import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthLifecycle } from './AuthLifecycle';
import { useAuthStore } from './auth-store';
const start = new Date('2026-10-22T00:00:00Z');
const user = { id:'10000000-0000-4000-8000-000000000001', companyId:'20000000-0000-4000-8000-000000000001', fullName:'Synthetic',email:'synthetic@example.test',role:'partner',isActive:true,passwordChangeRequired:false };
function session(token: string, milliseconds: number) { return { user,transport:'browser',tokenType:'Bearer',accessToken:token,accessTokenExpiresAt:new Date(Date.now()+milliseconds).toISOString() }; }
let hidden = false;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(start);hidden=false;vi.spyOn(document,'hidden','get').mockImplementation(()=>hidden);useAuthStore.getState().clear();});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();useAuthStore.getState().clear();});
async function mount(fetch: ReturnType<typeof vi.fn>) {
 vi.stubGlobal('fetch',fetch);
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><AuthLifecycle/></QueryClientProvider>);
 await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
 expect(useAuthStore.getState().session?.accessToken).toBe('first');
}
it('renews an active partner session without signing out at access-token expiry',async()=>{
 const fetch=vi.fn().mockImplementationOnce(()=>Promise.resolve(Response.json(session('first',120_000)))).mockImplementation(()=>Promise.resolve(Response.json(session('renewed',900_000))));
 await mount(fetch);
 await act(async()=>{await vi.advanceTimersByTimeAsync(65_000);});
 expect(fetch).toHaveBeenCalledTimes(2);
 expect(useAuthStore.getState().session?.accessToken).toBe('renewed');
 expect(useAuthStore.getState().phase).toBe('ready');
});
it('retains the renewable session while backgrounded and restores on return after access expiry',async()=>{
 const fetch=vi.fn().mockImplementationOnce(()=>Promise.resolve(Response.json(session('first',120_000)))).mockImplementation(()=>Promise.resolve(Response.json(session('after-sleep',900_000))));
 await mount(fetch);hidden=true;
 await act(async()=>{await vi.advanceTimersByTimeAsync(2*60*60*1000);});
 expect(fetch).toHaveBeenCalledTimes(1);
 expect(useAuthStore.getState().session?.accessToken).toBe('first');
 expect(useAuthStore.getState().phase).toBe('restoring');
 hidden=false;
 await act(async()=>{document.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(0);});
 expect(fetch).toHaveBeenCalledTimes(2);
 expect(useAuthStore.getState().session?.accessToken).toBe('after-sleep');
 expect(useAuthStore.getState().phase).toBe('ready');
});
it('signs out when the server rejects the expired absolute session',async()=>{
 const fetch=vi.fn().mockImplementationOnce(()=>Promise.resolve(Response.json(session('first',120_000)))).mockResolvedValue(Response.json({error:{code:'UNAUTHORIZED'}},{status:401}));
 await mount(fetch);hidden=true;
 await act(async()=>{await vi.advanceTimersByTimeAsync(24*60*60*1000);});
 hidden=false;
 await act(async()=>{window.dispatchEvent(new Event('focus'));await vi.advanceTimersByTimeAsync(0);});
 expect(useAuthStore.getState().session).toBeNull();
 expect(useAuthStore.getState().phase).toBe('ready');
});
it('shows reconnect after an uncertain renewal and does not automatically reuse the rotated credential',async()=>{
 const fetch=vi.fn().mockImplementationOnce(()=>Promise.resolve(Response.json(session('first',120_000)))).mockRejectedValue(new Error('response lost'));
 await mount(fetch);
 await act(async()=>{await vi.advanceTimersByTimeAsync(180_000);});
 expect(fetch).toHaveBeenCalledTimes(2);
 expect(useAuthStore.getState().phase).toBe('error');
 expect(useAuthStore.getState().session?.accessToken).toBe('first');
});
