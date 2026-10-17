import { useSearchParams } from 'react-router'
import { RequestFeedback } from '../../../shared/components/RequestFeedback'
import { useRetryDelay } from '../../../shared/hooks/use-retry-delay'
import { useDriverAvailability } from '../hooks/use-driver-availability'
import { isLocalDate, monthRange, shiftMonth, todayInIst } from '../validation/driver-calendar'

const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'UTC' })
const monthFormat = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const timestampFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
export function DriverAvailabilityCalendar({ driverId, enabled, eligible }: { driverId: string; enabled: boolean; eligible: boolean }) {
  const [params, setParams] = useSearchParams()
  const today = todayInIst()
  const month = params.get('month') ?? today.slice(0, 7)
  const range = monthRange(month)
  const requestedDay = params.get('day')
  const day = requestedDay ?? (today.startsWith(`${month}-`) ? today : range?.from ?? '')
  const validDay = range && isLocalDate(day) && day >= range.from && day < range.to
  const query = useDriverAvailability(driverId, range?.from ?? '', range?.to ?? '', enabled)
  const delay = useRetryDelay(query.error)
  const selected = query.data?.find((entry) => entry.availabilityDate === day)
  const available = query.data?.filter((entry) => entry.isAvailable).length ?? 0
  const unavailable = (query.data?.length ?? 0) - available
  const previous = shiftMonth(month, -1)
  const next = shiftMonth(month, 1)
  const firstWeekday = range ? (new Date(`${range.from}T00:00:00Z`).getUTCDay() + 6) % 7 : 0
  function handleMonth(value: string) {
    const updated = new URLSearchParams(params)
    if (value) updated.set('month', value)
    else updated.delete('month')
    updated.delete('day')
    setParams(updated)
  }
  function handleDay(value: string) { const updated = new URLSearchParams(params); updated.set('day', value); setParams(updated) }
  function label(date: string) {
    const entry = query.data?.find((value) => value.availabilityDate === date)
    return entry ? entry.isAvailable ? 'Available' : 'Unavailable' : 'Not provided'
  }
  return <section className="workspace-card drivers-calendar" aria-labelledby="driver-calendar-heading">
    <div className="drivers-document-heading"><h2 id="driver-calendar-heading">Availability calendar</h2><button className="workspace-button" type="button" disabled={!enabled || !range || query.isFetching || delay > 0} onClick={() => { void query.refetch() }}>{query.isFetching ? 'Refreshing…' : 'Refresh calendar'}</button></div>
    <p className="workspace-muted">Read-only calendar in Asia/Kolkata. Calendar availability, online status and operational activation are separate. An unrecorded date is not assumed unavailable. Availability does not reserve time or confirm freedom from trip overlaps.</p>
    {!eligible && <p className="workspace-notice workspace-warning">This driver is not eligible for assignment: an active driver profile and enabled user account are both required.</p>}
    <div className="drivers-calendar-navigation"><label className="workspace-field"><span id="calendar-month-label">Calendar month · IST</span><input type="month" aria-labelledby="calendar-month-label" value={range ? month : ''} onChange={(event) => handleMonth(event.target.value)} aria-invalid={!range} /></label><div className="workspace-actions"><button className="workspace-button" type="button" disabled={!previous} onClick={() => handleMonth(previous!)}>← Previous month</button><button className="workspace-button" type="button" onClick={() => handleMonth('')}>This month</button><button className="workspace-button" type="button" disabled={!next} onClick={() => handleMonth(next!)}>Next month →</button></div></div>
    {!range ? <p className="workspace-notice workspace-error" role="alert">Choose a valid calendar month.</p> : <>
      {query.isPending && <p role="status">{enabled ? 'Loading availability calendar…' : 'Refresh the driver profile before loading the calendar.'}</p>}
      {query.isError && <RequestFeedback error={query.error} pending={query.isFetching} onRetry={enabled ? () => { void query.refetch() } : undefined} />}
      {query.data && <>
        {query.isError && <p className="workspace-notice workspace-warning">This calendar is from the previous successful load and may be stale.</p>}
        <p className="workspace-muted" role="status">{available} available · {unavailable} unavailable · {range.days.length - query.data.length} not provided · {monthFormat.format(new Date(`${range.from}T00:00:00Z`))}</p>
        {!validDay ? <p className="workspace-notice workspace-error" role="alert">Choose a date within the selected calendar month.</p> : <section className="drivers-calendar-detail" aria-label="Selected calendar date"><h3>{dateFormat.format(new Date(`${day}T00:00:00Z`))} · {label(day)}</h3>{selected ? <><p>{selected.note ? `Note: ${selected.note}` : 'No note provided.'}</p><p className="workspace-muted">Updated · <time dateTime={selected.updatedAt}>{timestampFormat.format(new Date(selected.updatedAt))}</time> · IST</p></> : <p>No availability record was provided for this date.</p>}</section>}
        <div className="drivers-calendar-weekdays" aria-hidden="true">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name) => <span key={name}>{name}</span>)}</div>
        <ul className="drivers-calendar-grid" aria-label={`${monthFormat.format(new Date(`${range.from}T00:00:00Z`))} availability`}>
          {Array.from({ length: firstWeekday }, (_, index) => <li className="drivers-calendar-spacer" aria-hidden="true" key={`spacer-${index}`} />)}
          {range.days.map((date) => <li key={date}><button className={`drivers-calendar-day ${label(date) === 'Available' ? 'drivers-calendar-available' : label(date) === 'Unavailable' ? 'drivers-calendar-unavailable' : ''}`} type="button" aria-pressed={validDay && day === date ? true : false} aria-current={date === today ? 'date' : undefined} aria-label={`${dateFormat.format(new Date(`${date}T00:00:00Z`))} · ${label(date)}`} onClick={() => handleDay(date)}><time dateTime={date}>{Number(date.slice(-2))}</time><span>{label(date)}</span></button></li>)}
        </ul>
      </>}
    </>}
  </section>
}
