import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { useAuthStore } from '../../auth';
import { useWorkflowCommand } from '../../workflows';
import { isUuid } from '../../../shared/api/response-validation';
import { RequestFeedback } from '../../../shared/components/RequestFeedback';
import { currentActor, getStatement, validateStatementCommand, statementCompany } from '../api/statement-service';
type Action = 'regenerate' | 'submit' | 'approvals' | 'publish';
const labels: Record<Action, string> = { regenerate: 'Regenerate draft', submit: 'Submit for approval', approvals: 'Approve this version', publish: 'Publish statement' };
function StatementContent({ id }: {
    id: string;
}) {
    const session = useAuthStore(state => state.session);
    const [action, setAction] = useState<Action | null>(null);
    const [saved, setSaved] = useState('');
    const dialog = useRef<HTMLDialogElement>(null);
    const command = useWorkflowCommand(validateStatementCommand);
    const query = useQuery({ queryKey: ['statement', session?.user.email, id], enabled: !!session && isUuid(id), retry: false, refetchOnWindowFocus: false, queryFn: ({ signal }) => getStatement(id, session!.accessToken, signal) });
    const actor = useQuery({ queryKey: ['statement-actor', session?.user.email], enabled: !!session, retry: false, queryFn: ({ signal }) => currentActor(session!.accessToken, signal) });
    const row = query.data;
    const company = useQuery({ queryKey: ['statement-company', session?.user.email, row?.companyId], enabled: !!session && !!row, retry: false, queryFn: ({ signal }) => statementCompany(row!.companyId, session!.accessToken, signal) });
    const isCreator = actor.data === row?.createdByUserId;
    const creatorApproved = row?.approvals.some(item => item.adminUserId === row.createdByUserId);
    const didApprove = row?.approvals.some(item => item.adminUserId === actor.data);
    const otherApproved = row?.approvals.some(item => item.adminUserId !== row.createdByUserId);
    const locked = command.isPending || command.uncertain || command.delay > 0 || query.isFetching || query.isError || command.conflict || !company.data || company.isError || company.isFetching;
    function open(value: Action) { command.clear(); setAction(value); dialog.current?.showModal(); }
    function close() { if (command.isPending || command.uncertain)
        return; dialog.current?.close(); setAction(null); }
    async function confirm() { if (!action || !row || locked)
        return; const result = await command.run({ path: `/api/v1/statements/${id}/${action}`, body: { contentVersion: row.contentVersion } }); if (result) {
        setSaved(`${labels[action]} confirmed.`);
        dialog.current?.close();
        setAction(null);
        await query.refetch();
    } }
    async function refresh() { await query.refetch(); command.clear(); if (!command.uncertain) {
        dialog.current?.close();
        setAction(null);
    } }
    return <><Link className="workspace-back" to="/statements">← Monthly statements</Link><div className="workspace-heading"><div className="admin-page-heading"><h1 id="page-heading">Statement details</h1><p className="workspace-id">{id}</p></div><button className="workspace-button" disabled={command.isPending || command.uncertain || query.isFetching} onClick={() => void refresh()}>Refresh statement</button></div>{!isUuid(id) ? <p role="alert">Invalid statement link.</p> : query.isPending ? <p role="status">Loading statement…</p> : <>{query.isError && <RequestFeedback error={query.error}/>} {saved && <p className="workspace-notice workspace-success" role="status">{saved}</p>}{row && <><section className="workspace-card"><h2>{company.data?.name ?? 'Company details loading…'} · {row.periodStart.slice(0, 7)} statement</h2>{company.isError && <RequestFeedback error={company.error} onRetry={() => void company.refetch()}/>}<span className="workspace-badge">{row.status.replaceAll('_', ' ')}</span><p>Content version {row.contentVersion} · Asia/Kolkata · End date {row.periodEnd} excluded</p><dl className="workspace-definition"><div><dt>Company</dt><dd><Link to={`/companies/${row.companyId}`}>{company.data?.legalName ?? row.companyId}</Link></dd></div><div><dt>Trip total</dt><dd>₹{row.totalTripAmount}</dd></div><div><dt>Driver shares</dt><dd>₹{row.totalDriverShare}</dd></div><div><dt>Company shares</dt><dd>₹{row.totalCompanyShare}</dd></div><div><dt>Required approval</dt><dd>Creator: {creatorApproved ? 'approved' : 'pending'} · Other admin: {otherApproved ? 'approved' : 'pending'}</dd></div></dl><div className="workspace-actions">{row.status === 'draft' && isCreator && <><button className="workspace-button" disabled={locked} onClick={() => open('regenerate')}>Regenerate draft</button><button className="workspace-button workspace-button-primary" disabled={locked} onClick={() => open('submit')}>Submit for approval</button></>}{row.status === 'pending_verification' && <button className="workspace-button workspace-button-primary" disabled={locked || !actor.data || didApprove || (!isCreator && otherApproved)} onClick={() => open('approvals')}>{didApprove ? 'You approved this version' : 'Approve this version'}</button>}{row.status === 'verified' && <button className="workspace-button workspace-button-primary" disabled={locked || !actor.data} onClick={() => open('publish')}>Publish statement</button>}</div>{row.status === 'draft' && !isCreator && <p className="workspace-muted">Only the creator can regenerate or submit this draft.</p>}{row.status === 'pending_verification' && <p className="workspace-muted">The creator and one distinct second admin must explicitly approve this frozen version. Creating the draft is not an approval.</p>}{row.status === 'published' && <p className="workspace-notice workspace-success">Published to the company. Email delivery is handled separately.</p>}{actor.isError && <RequestFeedback error={actor.error} onRetry={() => void actor.refetch()}/>}</section><section className="workspace-card" style={{ marginTop: 24 }}><h2>Frozen trip lines</h2><ul className="workflow-list">{row.items.map(item => <li key={item.payrollId}><div><Link to={`/trips/${item.tripId}`}>Trip {item.tripId.slice(0, 8)}</Link><p>Driver {item.driverPercent}% · Company {item.companyPercent}%</p></div><div><strong>₹{item.tripAmount}</strong><p>Driver ₹{item.driverShareAmount} · Company ₹{item.companyShareAmount}</p></div></li>)}</ul><p className="workspace-muted">Expenses are reported separately from these commission amounts. Submitted content cannot be edited.</p></section></>}</>}
 <dialog ref={dialog} className="orders-modal" aria-labelledby="statement-action-heading" onCancel={event => { event.preventDefault(); close(); }}><h2 id="statement-action-heading">{action ? labels[action] : 'Statement action'}</h2><p>Review content version {row?.contentVersion} and the exact total ₹{row?.totalTripAmount} before confirming.</p>{action === 'publish' && <p>This makes the frozen statement visible to its company and queues a separate notification.</p>}{command.error && <RequestFeedback error={command.error}/>} {command.conflict && <button className="workspace-button" onClick={() => void refresh()}>Refresh current statement</button>}{command.uncertain && <p role="status">The response was interrupted. Retry the same action to confirm the saved result.</p>}<div className="workspace-actions"><button className="workspace-button" disabled={command.isPending || command.uncertain} onClick={close}>Cancel</button><button className="workspace-button workspace-button-primary" disabled={command.isPending || command.delay > 0 || command.conflict} onClick={async () => { if (command.uncertain) {
        if (await command.retry()) {
            dialog.current?.close();
            setAction(null);
            setSaved('The saved action is confirmed.');
            await query.refetch();
        }
    }
    else
        await confirm(); }}>{command.isPending ? 'Saving…' : command.uncertain ? 'Retry same action' : 'Confirm action'}</button></div></dialog></>;
}
export function StatementDetailPage() { const { statementId = '' } = useParams(); return <StatementContent key={statementId} id={statementId}/>; }
