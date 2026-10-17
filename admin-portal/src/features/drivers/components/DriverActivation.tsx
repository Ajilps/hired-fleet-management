import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { RequestFeedback } from '../../../shared/components/RequestFeedback'
import { useRetryDelay } from '../../../shared/hooks/use-retry-delay'
import { useActivateDriver, useDriverActivationReadiness } from '../hooks/use-driver-activation'

type ActivationCheck = ReturnType<typeof useDriverActivationReadiness>
function ActivateDriverDialog({ driverId, driverName, check, onClose, onActivated }: { driverId: string; driverName: string; check: ActivationCheck; onClose: () => void; onActivated: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [reviewPending, setReviewPending] = useState(false)
  const command = useActivateDriver(driverId)
  const checkDelay = useRetryDelay(check.error)
  const locked = command.isPending || command.uncertain
  useEffect(() => {
    const dialog = dialogRef.current!
    dialog.showModal()
    reasonRef.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { dialog.close(); document.body.style.overflow = previous }
  }, [])
  function handleClose() { if (!locked && !reviewPending) { dialogRef.current?.close(); onClose() } }
  async function handleReview() {
    setReviewPending(true)
    try { const result = await check.refetch(); if (result.isSuccess) command.completeReview() }
    finally { setReviewPending(false) }
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (reviewPending || (!command.uncertain && (check.isError || check.isFetching || !check.data?.ready || command.needsReview))) return
    if (!command.uncertain && (!reason.trim() || reason.trim().length > 500)) { setReasonError('Enter an activation reason of 1–500 characters.'); reasonRef.current?.focus(); return }
    setReasonError('')
    const saved = await command.run(reason)
    if (saved) onActivated()
  }
  return <dialog className="drivers-activation-dialog" ref={dialogRef} aria-labelledby="activation-heading" aria-describedby="activation-description" onCancel={(event) => { event.preventDefault(); handleClose() }}>
    <h2 id="activation-heading">Confirm operational activation</h2><p id="activation-description">Activate <strong>{driverName}</strong> for trip assignment and execution. This does not formally verify identity documents or change online status or calendar availability.</p>
    <form onSubmit={(event) => { void handleSubmit(event) }} noValidate><label className="workspace-field"><span id="activation-reason-label">Activation reason *</span><textarea ref={reasonRef} aria-labelledby="activation-reason-label" required maxLength={500} value={reason} disabled={locked} onChange={(event) => { setReason(event.target.value); setReasonError('') }} aria-invalid={Boolean(reasonError)} aria-describedby={reasonError ? 'activation-reason-error' : undefined} /></label>
      {reasonError && <p className="workspace-field-error" id="activation-reason-error" role="alert">{reasonError}</p>}
      {check.isError && <RequestFeedback error={check.error} />}
      {check.data && !check.data.ready && <ul className="drivers-activation-blockers">{check.data.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
      {command.error && <RequestFeedback error={command.error} />}
      {command.uncertain && <p className="workspace-notice workspace-warning" role="status">The activation outcome is unknown. Retry the same activation to confirm the result. The reason is locked; leaving or reloading loses this retry identity.</p>}
      {command.needsReview && <p className="workspace-muted">Refresh the activation check, then review the account and uploads before confirming again.</p>}
      {(command.needsReview || check.isError || !check.data?.ready) && !command.uncertain && <button className="workspace-button" type="button" disabled={command.isPending || reviewPending || check.isFetching || checkDelay > 0 || command.delay > 0} onClick={() => { void handleReview() }}>{reviewPending ? 'Checking…' : 'Refresh activation check'}</button>}
      <div className="workspace-actions"><button className="workspace-button" type="button" disabled={locked || reviewPending} onClick={handleClose}>Cancel</button><button className="workspace-button workspace-button-primary" type="submit" disabled={command.isPending || reviewPending || command.delay > 0 || (!command.uncertain && (command.needsReview || check.isFetching || check.isError || !check.data?.ready))}>{command.isPending ? 'Activating…' : command.uncertain ? 'Retry same activation' : 'Confirm activation'}</button></div>
    </form>
  </dialog>
}

export function DriverActivation({ driverId, driverName, enabled, onActivated }: { driverId: string; driverName: string; enabled: boolean; onActivated: () => void }) {
  const check = useDriverActivationReadiness(driverId, enabled)
  const delay = useRetryDelay(check.error)
  const [open, setOpen] = useState(false)
  const ready = enabled && check.data?.ready && !check.isError && !check.isFetching
  return <section className="drivers-activation" aria-labelledby="activation-check-heading"><h3 id="activation-check-heading">Activation check</h3><p className="workspace-muted">Requires an enabled account and four current uploads with clean safety scans.</p>
    {check.isPending && <p role="status">{enabled ? 'Checking activation requirements…' : 'Refresh the profile before activation.'}</p>}
    {check.isError && <RequestFeedback error={check.error} pending={check.isFetching} onRetry={enabled ? () => { void check.refetch() } : undefined} />}
    {check.data && <>{check.isError && <p className="workspace-notice workspace-warning">The previous activation check may be stale.</p>}{check.data.ready ? <p className="workspace-notice workspace-success">All four current uploads have clean safety scans.</p> : <ul className="drivers-activation-blockers">{check.data.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}</>}
    <div className="workspace-actions"><button className="workspace-button" type="button" disabled={!enabled || check.isFetching || delay > 0} onClick={() => { setOpen(false); void check.refetch() }}>Refresh activation check</button><button className="workspace-button workspace-button-primary" type="button" disabled={!ready} onClick={() => setOpen(true)}>Activate driver</button></div>
    {open && enabled && <ActivateDriverDialog driverId={driverId} driverName={driverName} check={check} onClose={() => setOpen(false)} onActivated={onActivated} />}
  </section>
}
