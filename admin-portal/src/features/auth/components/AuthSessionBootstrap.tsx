import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { refreshBrowserSession } from '../api/auth-service'
import { useAuthStore } from '../stores/use-auth-store'

export function AuthSessionBootstrap({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false)
  const [hasFailed, setHasFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let isCurrent = true
    const revision = useAuthStore.getState().sessionRevision
    void refreshBrowserSession().then((session) => {
      if (!isCurrent || useAuthStore.getState().sessionRevision !== revision) return
      if (session) useAuthStore.getState().establishSession(session)
      setHasFailed(false)
    }).catch(() => { if (isCurrent) setHasFailed(true) })
      .finally(() => { if (isCurrent) setIsReady(true) })
    return () => { isCurrent = false }
  }, [attempt])
  if (!isReady) return <main className="session-status"><p role="status">Restoring your session…</p></main>
  return <>{hasFailed && <div role="status">Unable to restore your session. You can sign in or <button type="button" onClick={() => { setIsReady(false); setAttempt((value) => value + 1) }}>Retry session</button>.</div>}{children}</>
}
