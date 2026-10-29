import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, apiGetWithMeta } from '@/lib/api'

export interface AsyncState<T> {
  data: T | null
  meta: Record<string, unknown> | undefined
  loading: boolean
  error: ApiError | null
  reload: () => void
}

/**
 * Fetch a resource from the API and expose its loading / error state.
 *
 * `path` may contain the query string already; `params` is merged into it.
 * The request is aborted when the component unmounts or the path changes,
 * so a fast navigation cannot leave a stale response behind.
 */
export function useApi<T>(
  path: string | null,
  params?: Record<string, string | number | boolean | undefined | null>,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [meta, setMeta] = useState<Record<string, unknown> | undefined>(undefined)
  const [loading, setLoading] = useState<boolean>(path !== null)
  const [error, setError] = useState<ApiError | null>(null)
  const [nonce, setNonce] = useState(0)
  const mounted = useRef(true)

  const key = `${path ?? ''}|${JSON.stringify(params ?? {})}|${nonce}`

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (path === null) {
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    apiGetWithMeta<T>(path, params, controller.signal)
      .then((result) => {
        if (!mounted.current || controller.signal.aborted) return
        setData(result.data)
        setMeta(result.meta)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!mounted.current || controller.signal.aborted) return
        if ((err as Error)?.name === 'AbortError') return
        setError(err instanceof ApiError ? err : new ApiError(0, 'unknown_error', String(err)))
        setLoading(false)
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { data, meta, loading, error, reload }
}
