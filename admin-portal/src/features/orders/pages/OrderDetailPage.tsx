import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../../shared/api/api-client'
import { isUuid } from '../../../shared/api/response-validation'
import { RequestFeedback } from '../../../shared/components/RequestFeedback'
import { useRetryDelay } from '../../../shared/hooks/use-retry-delay'
import { useAuthStore } from '../../auth'
import { decideOrder } from '../api/order-service'
import { useOrder, useCompanyOption } from '../hooks/use-orders'
import { useOrderCommand } from '../hooks/use-order-command'
import { normalizeAmount, safeOrdersReturn } from '../validation/order-validation'
import { sourceLabels } from '../types/order-types'
import './orders.css'

type Decision = { action: 'accept' | 'reject'; body: { totalAmount: string } | { reason: string }; etag: string }
const displayTime = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })

export function OrderDetailPage() {
  const { orderId } = useParams()
  return <OrderDetailScreen key={orderId} />
}

function OrderDetailScreen() {
  const { orderId = '' } = useParams()
  const [params] = useSearchParams()
  const location = useLocation()
  const returnTo = safeOrdersReturn(params.get('returnTo'))
  const query = useOrder(orderId)
  const queryDelay = useRetryDelay(query.error)
  const company = useCompanyOption(query.data?.order.companyId ?? '')
  const queryClient = useQueryClient()
  const session = useAuthStore((state) => state.session)
  const [action, setAction] = useState<'accept' | 'reject' | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [validation, setValidation] = useState('')
  const [conflict, setConflict] = useState(false)
  const [saved, setSaved] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const intent = useRef<Decision | null>(null)
  const command = useOrderCommand((input: Decision, key, token) => decideOrder(orderId, input.action, input.body, input.etag, key, token))
  const order = query.data?.order
  const locked = command.isPending || command.uncertain

  useEffect(() => {
    if (action && !dialogRef.current?.open) dialogRef.current?.showModal()
    if (!action && dialogRef.current?.open) dialogRef.current.close()
  }, [action])

  function handleOpen(next: 'accept' | 'reject') {
    command.clearError()
    setValidation('')
    setConflict(false)
    intent.current = null
    setAction(next)
  }
  function handleClose() { if (!locked) setAction(null) }

  async function handleDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!action || conflict) return
    setValidation('')
    if (!command.uncertain) {
      if (!query.data?.etag || order?.status !== 'received' || query.isError || query.isFetching) return
      const totalAmount = normalizeAmount(amount)
      if (action === 'accept' && totalAmount === null) { setValidation('Enter an INR amount from 0 to 9999999999.99, with at most two decimal places.'); return }
      if (action === 'reject' && (!reason.trim() || reason.trim().length > 2000)) { setValidation('Enter a rejection reason between 1 and 2000 characters.'); return }
      intent.current = { action, etag: query.data.etag, body: action === 'accept' ? { totalAmount: totalAmount! } : { reason: reason.trim() } }
    }
    if (!intent.current) return
    const result = await command.run(intent.current)
    if (result && useAuthStore.getState().session?.accessToken === session?.accessToken) {
      await queryClient.cancelQueries({ queryKey: ['order', session?.user.email, orderId] })
      if (useAuthStore.getState().session?.accessToken !== session?.accessToken) return
      queryClient.setQueryData(['order', session?.user.email, orderId], result)
      setSaved(result.order.status === 'accepted' ? 'Order accepted. An Unassigned trip was created; assign a driver separately.' : 'Order rejected. The saved rejection reason is shown below.')
      setAction(null)
    }
  }

  // A definitive version/state conflict requires a fresh read and a new explicit confirmation.
  const commandError = command.error
  const isConflict = commandError instanceof ApiError && [409, 412, 428].includes(commandError.status) && commandError.code !== 'COMMAND_IN_PROGRESS'
  async function handleRefreshConflict() {
    setConflict(true)
    await query.refetch()
  }

  return <>
    <Link className="workspace-back" to={returnTo}>← Back to orders</Link>
    <div className="workspace-heading"><div className="admin-page-heading"><h1 id="page-heading">Order details</h1><p className="workspace-id">{orderId}</p></div>
      {order && <button className="workspace-button" type="button" disabled={query.isFetching || locked || queryDelay > 0} onClick={() => { void query.refetch() }}>Refresh order</button>}
    </div>
    {!isUuid(orderId) ? <p role="alert">This order link is invalid.</p> : query.isPending ? <p role="status">Loading order…</p> : <>
      {query.isError && <RequestFeedback error={query.error} onRetry={() => { void query.refetch() }} pending={query.isFetching} />}
      {query.isError && order && <p className="workspace-notice workspace-warning">This order is from the previous successful load and may be stale. Refresh before deciding.</p>}
      {(saved || location.state?.created) && <p className="workspace-notice workspace-success" role="status">{saved || 'Order saved as Received. Review it before accepting or rejecting.'}</p>}
      {order && <div className="orders-layout">
        <section className="workspace-card" aria-labelledby="order-information"><h2 id="order-information">Order information</h2>
          <dl className="workspace-definition">
            <div className="workspace-span"><dt>Company</dt><dd>{company.data?.displayName ?? order.companyId}</dd></div>
            <div><dt>Pickup</dt><dd>{order.pickup}</dd></div><div><dt>Destination</dt><dd>{order.drop}</dd></div>
            <div><dt>Scheduled pickup · IST</dt><dd><time dateTime={order.requestedPickupAt}>{displayTime.format(new Date(order.requestedPickupAt))}</time></dd></div>
            <div><dt>Contact</dt><dd>{order.contact.name} · {order.contact.phone}</dd></div>
            <div><dt>Vehicle notes</dt><dd>{order.vehicleNotes ?? 'None supplied'}</dd></div><div><dt>Service notes</dt><dd>{order.serviceNotes ?? 'None supplied'}</dd></div>
            <div><dt>Source</dt><dd>{sourceLabels[order.source]}</dd></div><div><dt>Created · IST</dt><dd><time dateTime={order.createdAt}>{displayTime.format(new Date(order.createdAt))}</time></dd></div>
          </dl>
          <div className="workspace-notice"><strong>{order.estimate.durationMinutes === null ? 'Estimate unavailable' : `Estimated duration · ${order.estimate.durationMinutes} min`}</strong>
            {order.estimate.source && <p>{order.estimate.source === 'distance_heuristic' ? 'Rough distance-based estimate; actual travel time may vary.' : order.estimate.source === 'admin_override' ? 'Admin duration override; actual travel time may vary.' : 'Maps estimate; actual travel time may vary.'}</p>}
          </div>
        </section>
        <section className="workspace-card" aria-labelledby="order-decision"><h2 id="order-decision">Decision</h2><span className={`workspace-badge workspace-badge-${order.status}`}>{order.status}</span>
          {order.status === 'received' ? <>
            <div className="workspace-notice"><strong>Awaiting your decision</strong><p>Accept with a trip amount or reject with a reason.</p></div>
            {!query.data?.etag && <p className="workspace-notice workspace-warning" role="status">Decision unavailable: the server did not provide a strong order version. Refresh the order before deciding.</p>}
            <div className="workspace-actions"><button className="workspace-button workspace-button-danger" type="button" disabled={!query.data?.etag || query.isError || query.isFetching} onClick={() => handleOpen('reject')}>Reject order</button><button className="workspace-button workspace-button-primary" type="button" disabled={!query.data?.etag || query.isError || query.isFetching} onClick={() => handleOpen('accept')}>Accept order</button></div>
            <p className="workspace-muted">Acceptance creates an Unassigned trip. Driver assignment happens separately.</p>
          </> : order.status === 'accepted' ? <><div className="workspace-notice workspace-success">This order has been accepted. View its trip for the current operational state.</div><Link className="workspace-button workspace-button-primary" to={`/trips/${order.tripId}`}>View resulting trip →</Link></> : <><h3>Rejection reason</h3><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{order.rejectionReason}</p></>}
          <p className="workspace-muted">Email delivery is handled separately; a saved decision does not confirm delivery.</p>
        </section>
      </div>}
    </>}
    <dialog className="orders-modal" ref={dialogRef} aria-labelledby="decision-dialog-heading" onCancel={(event) => { event.preventDefault(); handleClose() }} onClose={() => setAction(null)}>
      <h2 id="decision-dialog-heading">{action === 'accept' ? 'Accept order with amount' : 'Reject order with reason'}</h2>
      <p>{action === 'accept' ? 'Confirm the INR trip amount. Saving creates one Unassigned trip.' : 'The rejection reason will be saved with this order.'}</p>
      <form onSubmit={(event) => { void handleDecision(event) }}>
        {action === 'accept' ? <label className="workspace-field">Trip amount · INR *<input autoFocus inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={locked} required aria-invalid={Boolean(validation)} aria-describedby={validation ? 'decision-validation' : undefined} /></label> : <label className="workspace-field">Rejection reason *<textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} disabled={locked} required maxLength={2000} aria-invalid={Boolean(validation)} aria-describedby={validation ? 'decision-validation' : undefined} /></label>}
        {validation && <p id="decision-validation" className="workspace-field-error" role="alert">{validation}</p>}
        {command.isPending && <p role="status">Saving decision…</p>}
        {commandError && <RequestFeedback error={commandError} />}
        {command.uncertain && <p className="workspace-notice workspace-warning" role="status">The decision response was interrupted. Retry the same decision to confirm its result. Inputs remain locked.</p>}
        {isConflict && <div className="workspace-notice workspace-warning"><p>Another decision or version may have been saved. Refresh, review the current order and reopen the dialog to confirm a new decision.</p><button className="workspace-button" type="button" disabled={query.isFetching} onClick={() => { void handleRefreshConflict() }}>{query.isFetching ? 'Refreshing…' : 'Refresh current order'}</button>{conflict && <p role="status">{query.isError ? 'Refresh failed. Try refreshing again before deciding.' : 'Close this dialog to review the current order. Your entered value is preserved.'}</p>}</div>}
        <div className="workspace-actions"><button className="workspace-button" type="button" disabled={locked} onClick={handleClose}>Cancel</button><button className={`workspace-button ${action === 'reject' ? 'workspace-button-danger' : 'workspace-button-primary'}`} type="submit" disabled={command.isPending || command.delay > 0 || isConflict || conflict || query.isFetching}>{command.isPending ? 'Saving decision…' : command.uncertain ? 'Retry same decision' : action === 'accept' ? 'Confirm acceptance' : 'Confirm rejection'}</button></div>
      </form>
    </dialog>
  </>
}
