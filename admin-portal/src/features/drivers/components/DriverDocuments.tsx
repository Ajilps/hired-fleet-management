import { useState } from 'react'
import { RequestFeedback } from '../../../shared/components/RequestFeedback'
import { useRetryDelay } from '../../../shared/hooks/use-retry-delay'
import { useDriverDocuments } from '../hooks/use-driver-documents'
import { documentLabels } from '../types/driver-document-types'
import type { DocumentType } from '../types/driver-document-types'
import { PrivateDocumentViewer } from './PrivateDocumentViewer'

const timeFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' })
export function DriverDocuments({ driverId, enabled }: { driverId: string; enabled: boolean }) {
  const query = useDriverDocuments(driverId, enabled)
  const delay = useRetryDelay(query.error)
  const [selectedType, setSelectedType] = useState<DocumentType | null>(null)
  const selected = query.data?.find((document) => document.documentType === selectedType)
  const canView = enabled && !query.isError && !query.isFetching
  function handleRefresh() { setSelectedType(null); void query.refetch() }
  return <section className="drivers-documents" aria-labelledby="driver-documents-heading">
    <div className="drivers-document-heading"><h2 id="driver-documents-heading">Current uploads</h2><button className="workspace-button" type="button" disabled={!enabled || query.isFetching || delay > 0} onClick={handleRefresh}>{query.isFetching ? 'Refreshing…' : 'Refresh documents'}</button></div>
    <p className="workspace-muted">Private documents are available only to authorized admins. Viewing a file does not formally verify it.</p>
    {query.isPending && <p role="status">{enabled ? 'Loading documents…' : 'Refresh the driver profile to load documents.'}</p>}
    {query.isError && <RequestFeedback error={query.error} pending={query.isFetching} onRetry={enabled ? handleRefresh : undefined} />}
    {query.data && <>
      {query.isError && <p className="workspace-notice workspace-warning">These upload records may be stale. Refresh documents before opening a file.</p>}
      {(Object.keys(documentLabels) as DocumentType[]).map((type) => {
        const document = query.data.find((item) => item.documentType === type)
        return <section className="drivers-document-row" key={type} aria-label={documentLabels[type]}><div><h3>{documentLabels[type]}</h3>{document ? <><p className="workspace-muted">Uploaded · <time dateTime={document.uploadedAt}>{timeFormat.format(new Date(document.uploadedAt))}</time> · IST</p>{document.expiresOn && <p className="workspace-muted">Expiry · <time dateTime={document.expiresOn}>{dateFormat.format(new Date(`${document.expiresOn}T00:00:00Z`))}</time></p>}</> : <p className="workspace-muted">No current upload.</p>}</div>
          {document && <button className="workspace-button" type="button" disabled={!canView} aria-label={`View ${documentLabels[type]} privately`} onClick={() => setSelectedType(type)}>View privately</button>}
        </section>
      })}
    </>}
    {selected && canView && <PrivateDocumentViewer key={`${selected.id}:${selected.fileAssetId}`} document={selected} onClose={() => setSelectedType(null)} />}
  </section>
}
