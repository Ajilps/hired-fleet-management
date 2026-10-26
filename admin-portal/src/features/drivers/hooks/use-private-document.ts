import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '../../auth'
import { ApiError } from '../../../shared/api/api-client'
import { useRetryDelay } from '../../../shared/hooks/use-retry-delay'
import { loadPrivateDocument } from '../api/driver-document-service'
import type { PreviewMimeType } from '../types/driver-document-types'

type Preview = { url: string; mimeType: PreviewMimeType; expiresAt: string }
export function usePrivateDocument(assetId: string) {
  const session = useAuthStore((state) => state.session)
  const controller = useRef<AbortController | null>(null)
  const objectUrl = useRef<string | null>(null)
  const mounted = useRef(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const delay = useRetryDelay(error)
  const mutation = useMutation({ mutationKey: ['private-document-preview', session?.user.email, assetId], retry: false, networkMode: 'always', gcTime: 0,
    // Private bytes/links never become mutation variables, results or query data.
    mutationFn: async () => {
      const request = controller.current!
      try {
        const content = await loadPrivateDocument(assetId, session!.accessToken, request.signal)
        if (!mounted.current || request.signal.aborted || useAuthStore.getState().session?.accessToken !== session?.accessToken) return
        const url = URL.createObjectURL(content.blob)
        objectUrl.current = url
        setPreview({ url, mimeType: content.mimeType, expiresAt: content.expiresAt })
      } catch (failure) {
        // An abandoned request must not expire a later session via the global mutation handler.
        if (request.signal.aborted || useAuthStore.getState().session?.accessToken !== session?.accessToken) return
        throw failure
      }
    },
  })
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; controller.current?.abort(); controller.current = null; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); objectUrl.current = null }
  }, [assetId, session?.accessToken])
  useEffect(() => {
    if (!preview) return
    const timer = window.setTimeout(() => {
      if (objectUrl.current === preview.url) { URL.revokeObjectURL(preview.url); objectUrl.current = null; setPreview(null); setError(new ApiError(410, 'This private preview expired. Try again to request a new preview.')) }
    }, Math.min(Math.max(0, Date.parse(preview.expiresAt) - Date.now()), 2_147_483_647))
    return () => window.clearTimeout(timer)
  }, [preview])
  async function run() {
    if (!session || controller.current || delay > 0) return
    const request = new AbortController()
    controller.current = request
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = null
    setPreview(null)
    setError(null)
    const timer = window.setTimeout(() => request.abort(), 30_000)
    try {
      await mutation.mutateAsync()
      if (request.signal.aborted && mounted.current && controller.current === request) setError(new Error('The private preview timed out. Try again.'))
    }
    catch (failure) { if (mounted.current && controller.current === request && useAuthStore.getState().session?.accessToken === session.accessToken) setError(failure instanceof Error ? failure : new Error('The private preview could not be loaded.')) }
    finally { window.clearTimeout(timer); request.abort(); if (controller.current === request) { controller.current = null; mutation.reset() } }
  }
  function handleRenderFailure() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = null
    setPreview(null)
    setError(new ApiError(415, 'This file could not be displayed. Try again for a new preview.'))
  }
  return { run, preview, error, delay, isPending: mutation.isPending, handleRenderFailure }
}
