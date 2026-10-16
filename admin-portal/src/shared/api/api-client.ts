export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type AuthenticatedRequestOptions = { accessToken: string; signal?: AbortSignal }

export async function requestAuthenticatedJson(path: string, { accessToken, signal }: AuthenticatedRequestOptions): Promise<unknown> {
  const controller = new AbortController()
  const handleAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', handleAbort, { once: true })
  const timeout = window.setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      credentials: 'omit', cache: 'no-store', signal: controller.signal,
    })
    if (response.status === 401) throw new ApiError(401, 'Sign in again to continue.')
    if (response.status === 403) throw new ApiError(403, 'You do not have access to this information.')
    if (!response.ok) throw new ApiError(response.status, 'Unable to load your workspace. Please try again.')
    return await response.json().catch(() => { throw new ApiError(502, 'The server returned an unexpected response.') })
  } catch (error) {
    if (error instanceof ApiError || signal?.aborted) throw error
    throw new ApiError(0, 'Unable to connect. Check your connection and try again.')
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', handleAbort)
  }
}
