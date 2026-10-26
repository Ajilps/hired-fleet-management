import { HttpError } from '../../shared/http/http-error.ts'

export function aggregateEtag(entityType: string, entityId: string, version: bigint) {
  if (!/^[a-z][a-z0-9-]{0,49}$/.test(entityType) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(entityId) || version < 1n || version > 9_223_372_036_854_775_807n) throw new Error('Invalid aggregate version identity.')
  return `"${entityType}:${entityId}:${version}"`
}
export function requireAggregateMatch(ifMatch: string | undefined, currentEtag: string) {
  if (ifMatch === undefined) throw new HttpError(428, 'PRECONDITION_REQUIRED', 'A current If-Match header is required.')
  if (ifMatch !== currentEtag || !/^"[\x21\x23-\x7e]+"$/.test(ifMatch)) throw new HttpError(412, 'PRECONDITION_FAILED', 'The resource has changed. Refresh before a new command.')
}
export function nextAggregateVersion(version: bigint) {
  if (version < 1n || version >= 9_223_372_036_854_775_807n) throw new Error('Aggregate version cannot advance.')
  return version + 1n
}
