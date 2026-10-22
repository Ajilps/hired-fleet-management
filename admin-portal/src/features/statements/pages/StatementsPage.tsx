import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAuthStore } from '../../auth';
import { useWorkflowCommand } from '../../workflows';
import { RequestFeedback } from '../../../shared/components/RequestFeedback';
import { companyOptions, listStatements, validateStatementCommand } from '../api/statement-service';
export function StatementsPage() {
    const session = useAuthStore(state => state.session);
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const [companyId, setCompanyId] = useState('');
    const [month, setMonth] = useState('');
    const command = useWorkflowCommand(validateStatementCommand);
    const companyFilter = params.get('companyId') ?? '';
    const status = params.get('status') ?? '';
    const billingMonth = params.get('billingMonth') ?? '';
    const cursor = params.get('cursor') ?? '';
    const filters = new URLSearchParams({ limit: '25' });
    for (const [key, value] of [['companyId', companyFilter], ['status', status], ['billingMonth', billingMonth], ['cursor', cursor]])
        if (value)
            filters.set(key!, value!);
    const query = useQuery({ queryKey: ['statements', session?.user.email, companyFilter, status, billingMonth, cursor], enabled: !!session, retry: false, queryFn: ({ signal }) => listStatements(filters, session!.accessToken, signal) });
    const companies = useInfiniteQuery({ queryKey: ['statement-companies', session?.user.email], enabled: !!session, initialPageParam: '', retry: false, queryFn: ({ pageParam, signal }) => companyOptions(pageParam, session!.accessToken, signal), getNextPageParam: (page, pages) => page.pageInfo.hasMore && !pages.some(previous => previous !== page && previous.pageInfo.nextCursor === page.pageInfo.nextCursor) ? page.pageInfo.nextCursor ?? undefined : undefined });
    function filter(name: string, value: string) { const next = new URLSearchParams(params); next.delete('cursor'); if (value)
        next.set(name, value);
    else
        next.delete(name); setParams(next); }
    async function handleGenerate(event: React.SubmitEvent<HTMLFormElement>) { event.preventDefault(); if (command.isPending || command.uncertain || command.delay > 0)
        return; const result = await command.run({ path: '/api/v1/statements', body: { companyId, billingMonth: month } }); if (result)
        navigate(`/statements/${result.id}`); }
    return <><div className="workspace-heading"><div className="admin-page-heading"><h1 id="page-heading">Monthly statements</h1><p>Generate completed-month drafts, review frozen content, approve and publish.</p></div><button className="workspace-button" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh statements</button></div><div className="workflow-grid"><section className="workspace-card"><h2>Generate a statement</h2><p>Uses trips closed during a completed calendar month in Asia/Kolkata. Creation does not count as approval.</p>{companies.isError && <RequestFeedback error={companies.error} onRetry={() => void companies.refetch()}/>}<form onSubmit={event => void handleGenerate(event)}><fieldset disabled={command.isPending || command.uncertain || command.delay > 0}><label className="workspace-field">Statement company<select required value={companyId} onChange={event => { setCompanyId(event.target.value); command.clear(); }}><option value="">Choose a company</option>{companies.data?.pages.flatMap(page => page.items).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>{companies.hasNextPage && <button className="workspace-button" type="button" disabled={companies.isFetching} onClick={() => void companies.fetchNextPage()}>Load more companies</button>}<label className="workspace-field">Billing month · IST<input type="month" required value={month} onChange={event => { setMonth(event.target.value); command.clear(); }}/></label><button className="workspace-button workspace-button-primary" type="submit">Generate draft statement</button></fieldset></form>{command.error && <RequestFeedback error={command.error}/>} {command.uncertain && <button className="workspace-button" disabled={command.isPending || command.delay > 0} onClick={async () => { const result = await command.retry(); if (result)
        navigate(`/statements/${result.id}`); }}>Retry same generation</button>}</section><section className="workspace-card"><h2>Review process</h2><p>The creator reviews and submits the draft. The creator and one other admin must explicitly approve the same content version before publication.</p><p>Published statements are visible only to their company. Email delivery runs separately.</p></section></div><section className="workspace-card"><div className="workspace-fields"><label className="workspace-field">Filter company<select value={companyFilter} onChange={event => filter('companyId', event.target.value)}><option value="">All companies</option>{companies.data?.pages.flatMap(page => page.items).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className="workspace-field">Statement status<select value={status} onChange={event => filter('status', event.target.value)}><option value="">All statuses</option>{['draft', 'pending_verification', 'verified', 'published'].map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label><label className="workspace-field">Filter billing month<input type="month" value={billingMonth} onChange={event => filter('billingMonth', event.target.value)}/></label></div>{query.isPending ? <p role="status">Loading statements…</p> : query.isError ? <RequestFeedback error={query.error} onRetry={() => void query.refetch()}/> : query.data && <><p>{query.data.pageInfo.totalCount} matching statements</p><ul className="workflow-list">{query.data.items.map(row => <li key={row.id}><div><Link to={`/statements/${row.id}`}>{row.periodStart.slice(0, 7)} · {row.id.slice(0, 8)}</Link><p>{row.status.replaceAll('_', ' ')} · Version {row.contentVersion}</p></div><strong>₹{row.totalTripAmount}</strong></li>)}</ul>{query.data.items.length === 0 && <p>No statements match these filters.</p>}<div className="workspace-actions">{cursor && <button className="workspace-button" onClick={() => filter('cursor', '')}>First page</button>}{query.data.pageInfo.hasMore && <button className="workspace-button" onClick={() => setParams({ ...Object.fromEntries(params), cursor: query.data.pageInfo.nextCursor! })}>Next page</button>}</div></>}</section></>;
}
