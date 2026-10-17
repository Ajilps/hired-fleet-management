import { useEffect, useState } from 'react'
import { ApiError } from '../api/api-client'

export function useRetryDelay(error: Error | null | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  const until = error instanceof ApiError ? error.retryAt : null
  useEffect(() => {
    if (!until) return
    const timer = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= until) window.clearInterval(timer)
    }, 500)
    return () => window.clearInterval(timer)
  }, [until])
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0
}
