export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  code: string | null
  retryAt: number | null

  constructor(status: number, message: string, code: string | null = null, retryAt: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryAt = retryAt
  }
}

type AuthenticatedRequestOptions = {
  accessToken: string
  signal?: AbortSignal
  method?: 'GET' | 'POST'
  body?: unknown
  idempotencyKey?: string
  etag?: string
}

function retryAt(response: Response, fallback: unknown): number | null {
  const header = response.headers.get('Retry-After')
  if (header && /^\d+$/.test(header) && Number.isSafeInteger(Number(header))) return Date.now() + Number(header) * 1000
  if (header && Number.isFinite(Date.parse(header))) return Date.parse(header)
  return typeof fallback === 'number' && Number.isSafeInteger(fallback) && fallback >= 0 ? Date.now() + fallback * 1000 : null
}

export async function requestAuthenticated(path: string, { accessToken, signal, method, body, idempotencyKey, etag }: AuthenticatedRequestOptions): Promise<{ data: unknown; etag: string | null }> {
  const controller = new AbortController()
  const handleAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', handleAbort, { once: true })
  const timeout = window.setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...(method ? { method } : {}),
      headers: {
        Accept: 'application/json', Authorization: `Bearer ${accessToken}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        ...(etag ? { 'If-Match': etag } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      credentials: 'omit', cache: 'no-store', signal: controller.signal,
    })
    if (response.status === 401) throw new ApiError(401, 'Sign in again to continue.')
    if (response.status === 403) throw new ApiError(403, 'You do not have access to this information.')
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const error = data && typeof data === 'object' ? data.error : null
      const code = typeof error?.code === 'string' ? error.code : null
      const messages: Record<number, string> = {
        400: 'Check the request and try again.', 404: 'This record is unavailable.',
        409: 'This request conflicts with the current record. Refresh before deciding again.',
        412: 'Another change was saved first. Refresh before deciding again.',
        422: 'Check the entered values and try again.', 428: 'The order version is missing. Refresh before deciding again.',
        429: 'Too many requests. Wait before trying again.',
      }
      throw new ApiError(response.status, messages[response.status] ?? 'Unable to load your workspace. Please try again.', code, retryAt(response, error?.retryAfterSeconds))
    }
    if (data === null) throw new ApiError(502, 'The server returned an unexpected response.')
    return { data, etag: response.headers.get('ETag') }
  } catch (error) {
    if (error instanceof ApiError || signal?.aborted) throw error
    throw new ApiError(0, 'Unable to connect. Check your connection and try again.')
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', handleAbort)
  }
}

export async function requestAuthenticatedJson(path: string, options: AuthenticatedRequestOptions): Promise<unknown> {
  return (await requestAuthenticated(path, options)).data
}
