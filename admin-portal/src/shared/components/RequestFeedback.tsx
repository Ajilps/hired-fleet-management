import { useRetryDelay } from '../hooks/use-retry-delay'

export function RequestFeedback({ error, onRetry, pending = false }: { error: Error; onRetry?: () => void; pending?: boolean }) {
  const delay = useRetryDelay(error)
  return <div className="workspace-notice workspace-error" role="alert"><p>{error.message}</p>
    {delay > 0 && <p>Try again in {delay} seconds.</p>}
    {onRetry && <button className="workspace-button" type="button" disabled={pending || delay > 0} onClick={onRetry}>{pending ? 'Refreshing…' : 'Try again'}</button>}
  </div>
}
