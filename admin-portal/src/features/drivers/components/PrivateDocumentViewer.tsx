import { useEffect, useRef } from 'react'
import { RequestFeedback } from '../../../shared/components/RequestFeedback'
import { usePrivateDocument } from '../hooks/use-private-document'
import { documentLabels } from '../types/driver-document-types'
import type { DriverDocument } from '../types/driver-document-types'

export function PrivateDocumentViewer({ document, onClose }: { document: DriverDocument; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const content = usePrivateDocument(document.fileAssetId)
  const initialLoad = useRef(content.run)
  useEffect(() => {
    const dialog = dialogRef.current!
    dialog.showModal()
    const previousOverflow = window.document.body.style.overflow
    window.document.body.style.overflow = 'hidden'
    void initialLoad.current()
    return () => { dialog.close(); window.document.body.style.overflow = previousOverflow }
  }, [])
  function handleClose() { dialogRef.current?.close(); onClose() }
  const label = documentLabels[document.documentType]
  return <dialog className="drivers-document-dialog" ref={dialogRef} aria-labelledby="private-document-heading" aria-describedby="private-document-help" onCancel={(event) => { event.preventDefault(); handleClose() }} onClick={(event) => { if (event.target === event.currentTarget) handleClose() }}>
    <div className="drivers-document-heading"><h2 id="private-document-heading">{label} · Private preview</h2><button className="workspace-button" type="button" onClick={handleClose} autoFocus>Close preview</button></div>
    <p id="private-document-help" className="workspace-muted">Open this document for operational review. Close the preview when finished.</p>
    {!content.preview && !content.isPending && !content.error && <button className="workspace-button workspace-button-primary" type="button" onClick={() => { void content.run() }}>Load private preview</button>}
    {content.isPending && <p role="status">Loading private document…</p>}
    {content.error && <RequestFeedback error={content.error} pending={content.isPending} onRetry={() => { void content.run() }} />}
    {content.preview && <div className="drivers-document-content">{content.preview.mimeType === 'application/pdf'
      ? <iframe title={`${label} PDF preview`} src={content.preview.url} referrerPolicy="no-referrer" onError={content.handleRenderFailure} />
      : <img src={content.preview.url} alt={`${label} private document`} onError={content.handleRenderFailure} />}</div>}
  </dialog>
}
