import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../auth'
import { RequestFeedback } from '../../../shared/components/RequestFeedback'
import { isUuid } from '../../../shared/api/response-validation'
import { CompanyPicker } from '../components/CompanyPicker'
import { createOrder } from '../api/order-service'
import { useOrderCommand } from '../hooks/use-order-command'
import { useCompanyOption } from '../hooks/use-orders'
import { istDateTime, safeOrdersReturn } from '../validation/order-validation'
import type { CreateOrderInput } from '../types/order-types'
import './orders.css'

export function CreateOrderPage() {
  const [params] = useSearchParams()
  const returnTo = safeOrdersReturn(params.get('returnTo'))
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const session = useAuthStore((state) => state.session)
  const [companyId, setCompanyId] = useState('')
  const company = useCompanyOption(companyId)
  const [validation, setValidation] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const draft = useRef<CreateOrderInput | null>(null)
  const command = useOrderCommand(createOrder)
  const locked = command.isPending || command.uncertain

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setValidation('')
    if (!command.uncertain) {
      const fields = new FormData(event.currentTarget)
      const value = (name: string) => String(fields.get(name) ?? '').trim()
      const pickupAt = istDateTime(value('pickupAt'))
      if (!isUuid(companyId) || !company.data?.isActive || !pickupAt || !value('pickup') || !value('drop') || !value('contactName') || !value('contactPhone')) {
        setValidation('Enter the required route, pickup time and contact fields, and select a confirmed active company.')
        formRef.current?.querySelector<HTMLInputElement>('input:invalid')?.focus()
        return
      }
      draft.current = {
        companyId, source: value('source') as CreateOrderInput['source'], pickup: { address: value('pickup') }, drop: { address: value('drop') }, requestedPickupAt: pickupAt,
        contact: { name: value('contactName'), phone: value('contactPhone') }, vehicleNotes: value('vehicleNotes') || null, serviceNotes: value('serviceNotes') || null,
      }
    }
    if (!draft.current) return
    const order = await command.run(draft.current)
    if (order) {
      // Creation does not return an ETag; read the detail before allowing decisions.
      queryClient.removeQueries({ queryKey: ['order', session?.user.email, order.id] })
      navigate(`/orders/${order.id}?returnTo=${encodeURIComponent(returnTo)}`, { replace: true, state: { created: true } })
    }
  }
  return <>
    <Link className="workspace-back" to={returnTo}>← Back to orders</Link>
    <div className="admin-page-heading"><h1 id="page-heading">Create order</h1><p>Record a phone, WhatsApp or manual request. Pickup time is entered in IST.</p></div>
    <form className="orders-layout orders-creation" ref={formRef} onSubmit={(event) => { void handleSubmit(event) }}>
      <section className="workspace-card" aria-labelledby="new-order-details"><h2 id="new-order-details">Order details</h2><fieldset disabled={locked}><div className="workspace-fields">
        <CompanyPicker value={companyId} onChange={setCompanyId} activeOnly required disabled={locked} />
        <label className="workspace-field">Booking source *<select name="source" defaultValue="admin_phone" required><option value="admin_phone">Phone</option><option value="admin_whatsapp">WhatsApp</option><option value="admin_manual">Manual entry</option></select></label>
        <label className="workspace-field workspace-span">Pickup address *<input name="pickup" required /></label>
        <label className="workspace-field workspace-span">Drop-off address *<input name="drop" required /></label>
        <label className="workspace-field workspace-span">Pickup date and time · IST *<input name="pickupAt" type="datetime-local" required /></label>
        <label className="workspace-field workspace-span">Vehicle notes<input name="vehicleNotes" maxLength={2000} /></label>
        <label className="workspace-field workspace-span">Service notes<textarea name="serviceNotes" maxLength={2000} /></label>
      </div></fieldset></section>
      <section className="workspace-card" aria-labelledby="new-order-contact"><h2 id="new-order-contact">Contact and review</h2><fieldset disabled={locked}><div className="workspace-fields">
        <label className="workspace-field workspace-span">Contact name *<input name="contactName" required maxLength={150} autoComplete="name" /></label>
        <label className="workspace-field workspace-span">Contact phone *<input name="contactPhone" required maxLength={30} type="tel" autoComplete="tel" /></label>
      </div></fieldset>
      <div className="workspace-notice"><strong>Estimate unavailable</strong><p>The server supplies any available duration estimate after saving.</p></div>
      <p className="workspace-muted">This request will be saved as Received. Acceptance and driver assignment happen separately.</p>
      {companyId && company.isPending && <p role="status">Checking company availability…</p>}
      {company.isError && <RequestFeedback error={company.error} onRetry={() => { void company.refetch() }} pending={company.isFetching} />}
      {company.data && !company.data.isActive && <p role="alert">This company is inactive. Choose an active company.</p>}
      {validation && <p role="alert" className="workspace-field-error">{validation}</p>}
      {command.isPending && <p role="status">Saving order…</p>}
      {command.error && <RequestFeedback error={command.error} />}
      {command.uncertain && <p className="workspace-notice workspace-warning" role="status">Save status is unknown. Keep this page open and retry the same request to confirm it. The entered values are locked to prevent a duplicate order.</p>}
      <div className="workspace-actions">{!locked && <Link className="workspace-button" to={returnTo}>Cancel</Link>}<button className="workspace-button workspace-button-primary" type="submit" disabled={command.isPending || command.delay > 0 || !command.uncertain && (!company.data?.isActive || company.isError || company.isFetching)}>{command.isPending ? 'Saving…' : command.uncertain ? 'Retry same save' : 'Save order'}</button></div>
      </section>
    </form>
  </>
}
