export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(
  /\/$/,
  "",
);
export class ApiError extends Error {
  status: number;
  code: string | null;
  retryAt: number | null;
  constructor(
    status: number,
    message: string,
    code: string | null = null,
    retryAt: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAt = retryAt;
  }
}
export function retryAt(response: Response, fallback: unknown): number | null {
  const header = response.headers.get("Retry-After");
  if (header && /^\d+$/.test(header) && Number.isSafeInteger(Number(header)))
    return Date.now() + Number(header) * 1000;
  if (header && Number.isFinite(Date.parse(header))) return Date.parse(header);
  return typeof fallback === "number" &&
    Number.isSafeInteger(fallback) &&
    fallback >= 0
    ? Date.now() + fallback * 1000
    : null;
}
export async function request(
  path: string,
  options: {
    token?: string;
    method?: "GET" | "POST";
    body?: unknown;
    key?: string;
    signal?: AbortSignal;
    cookie?: boolean;
  } = {},
): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}/api/v1${path}`, {
    method: options.method ?? "GET",
    cache: "no-store",
    credentials: options.cookie ? "include" : "omit",
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000),
    headers: {
      Accept: "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(options.key ? { "Idempotency-Key": options.key } : {}),
      ...(options.method === "POST" ? { "X-CSRF-Guard": "1" } : {}),
    },
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  }).catch(() => {
    throw new ApiError(
      0,
      "Unable to connect. Check your connection and try again.",
    );
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = typeof body?.error?.code === "string" ? body.error.code : null;
    const messages: Record<number, string> = {
      401: "Your session has ended. Sign in again to continue.",
      403: "Your account cannot use this action.",
      404: "This information is unavailable.",
      409: "This request conflicts with the current record. Refresh before continuing.",
      412: "This record changed. Refresh before continuing.",
      422: "Check the entered information and try again.",
      429: "Too many requests. Please wait before trying again.",
    };
    throw new ApiError(
      response.status,
      messages[response.status] ??
        "This service is unavailable right now. Please try again.",
      code,
      retryAt(response, body?.error?.retryAfterSeconds),
    );
  }
  if (body === null)
    throw new ApiError(502, "The server returned an unexpected response.");
  return body;
}
