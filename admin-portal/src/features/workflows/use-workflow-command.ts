import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../auth';
import { ApiError, requestAuthenticated } from '../../shared/api/api-client';
import { useRetryDelay } from '../../shared/hooks/use-retry-delay';
import { readObject } from '../../shared/api/response-validation';
export type WorkflowInput = {
    path: string;
    body: unknown;
    etag?: string;
    method?: 'POST' | 'PATCH';
};
export function useWorkflowCommand(validate: (value: unknown, input: WorkflowInput) => Record<string, unknown> = readObject) {
    const session = useAuthStore(state => state.session);
    const client = useQueryClient();
    const intent = useRef<{
        input: WorkflowInput;
        fingerprint: string;
        key: string;
    } | null>(null);
    const pending = useRef(false);
    const mounted = useRef(true);
    const [error, setError] = useState<Error | null>(null);
    const [uncertain, setUncertain] = useState(false);
    const delay = useRetryDelay(error);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; intent.current = null; }; }, []);
    const mutation = useMutation({ mutationKey: ['workflow-command', session?.user.email], retry: false, gcTime: 0, networkMode: 'always', mutationFn: async (value: {
            input: WorkflowInput;
            key: string;
        }) => { if (!session)
            throw new ApiError(401, 'Sign in again to continue.'); const response = await requestAuthenticated(value.input.path, { accessToken: session.accessToken, method: value.input.method ?? 'POST', body: value.input.body, etag: value.input.etag, idempotencyKey: value.key }); return validate(response.data, value.input); } });
    async function run(input: WorkflowInput) {
        if (pending.current || delay > 0)
            return;
        const fingerprint = JSON.stringify(input);
        if (uncertain && intent.current?.fingerprint !== fingerprint)
            return;
        if (!intent.current || intent.current.fingerprint !== fingerprint)
            intent.current = { input, fingerprint, key: crypto.randomUUID() };
        const revision = useAuthStore.getState().sessionRevision;
        pending.current = true;
        setError(null);
        try {
            const result = await mutation.mutateAsync({ input: intent.current.input, key: intent.current.key });
            if (!mounted.current || useAuthStore.getState().sessionRevision !== revision)
                return;
            intent.current = null;
            setUncertain(false);
            void client.invalidateQueries({ predicate: query => query.queryKey.includes(session?.user.email) && ['trips', 'trip-detail', 'trip-history', 'trip-expenses', 'overview', 'orders', 'statements', 'statement'].includes(String(query.queryKey[0])) });
            return result;
        }
        catch (value) {
            if (!mounted.current || useAuthStore.getState().sessionRevision !== revision)
                return;
            const failure = value instanceof Error ? value : new Error('The command could not be confirmed.');
            const ambiguous = failure instanceof ApiError && (failure.status === 0 || failure.status >= 500 || failure.code === 'COMMAND_IN_PROGRESS');
            setUncertain(ambiguous);
            if (!ambiguous && !(failure instanceof ApiError && failure.status === 429))
                intent.current = null;
            setError(failure);
        }
        finally {
            pending.current = false;
            mutation.reset();
        }
    }
    return { run, retry: () => intent.current ? run(intent.current.input) : Promise.resolve(undefined), error, uncertain, delay, isPending: mutation.isPending, conflict: error instanceof ApiError && [409, 412, 428].includes(error.status) && error.code !== 'COMMAND_IN_PROGRESS', clear: () => { if (!pending.current && !uncertain && delay === 0) {
            intent.current = null;
            setError(null);
        } } };
}
