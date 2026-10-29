/**
 * API client.
 *
 * The backend is the source of truth for every record in the app. This
 * module is the only place that talks to it, so the session cookie, the
 * CSRF token and error handling are handled in one spot.
 *
 * Response envelope (enforced by the PHP kernel):
 *   success -> { "data": <payload>, "meta"?: {...} }
 *   failure -> { "error": { "code": "...", "message": "...", "details": {...} } }
 */

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** Field-level validation errors, keyed by field name. */
  get fieldErrors(): Record<string, string[]> {
    const fields = this.details?.fields
    return (fields ?? {}) as Record<string, string[]>
  }
}

/**
 * The CSRF token for the current session. It lives in memory only — it is
 * re-issued by the server on every page load via /api/auth/me, so it never
 * has to be persisted.
 */
let csrfToken: string | null = null

export function setCsrfToken(token: string | null): void {
  csrfToken = token
}

export function getCsrfToken(): string | null {
  return csrfToken
}

/**
 * Where the API lives.
 *
 * Empty by default, which keeps every request on the same origin — the
 * arrangement the Vite dev proxy uses, and the one to prefer in production.
 * Set `VITE_API_URL` when the API is served from another host (for example
 * a PHP host next to a Vercel deployment): the requests then carry
 * credentials to that origin, so the API has to list this one in
 * `CORS_ORIGINS` and to set its cookie with `SameSite=None; Secure`.
 */
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

/** Prefix a path with the API base, when there is one. */
export function apiUrl(path: string): string {
  return API_BASE === '' ? path : API_BASE + path
}

export interface ApiResult<T> {
  data: T
  meta?: Record<string, unknown>
}

type QueryValue = string | number | boolean | undefined | null

export function buildQuery(params?: Record<string, QueryValue>): string {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  /** Send the request without the session cookie (used by sign-in). */
  anonymous?: boolean
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (method !== 'GET' && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }

  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      credentials: 'include',
      signal: options.signal,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error
    throw new ApiError(0, 'network_error', 'The server could not be reached. Check that the API is running.')
  }

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: Record<string, unknown> } })?.error
    throw new ApiError(
      response.status,
      error?.code ?? 'request_failed',
      error?.message ?? `The request failed (${response.status}).`,
      error?.details ?? {},
    )
  }

  const body = (payload ?? {}) as { data?: T; meta?: Record<string, unknown> }
  return { data: (body.data ?? (body as unknown)) as T, meta: body.meta }
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, QueryValue>,
  signal?: AbortSignal,
): Promise<T> {
  const result = await apiRequest<T>(`${path}${buildQuery(params)}`, { signal })
  return result.data
}

export async function apiGetWithMeta<T>(
  path: string,
  params?: Record<string, QueryValue>,
  signal?: AbortSignal,
): Promise<ApiResult<T>> {
  return apiRequest<T>(`${path}${buildQuery(params)}`, { signal })
}

export async function apiSend<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const result = await apiRequest<T>(path, { method, body })
  return result.data
}

/** Download a file the API returns as a blob (CSV exports, print views). */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const response = await fetch(apiUrl(path), { credentials: 'include' })
  if (!response.ok) {
    throw new ApiError(response.status, 'download_failed', 'The download could not be completed.')
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
