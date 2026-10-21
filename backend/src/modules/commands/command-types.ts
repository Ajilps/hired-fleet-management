import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type CommandActor = { userId: string; sessionId: string; role: 'admin' | 'partner' | 'driver'; transport: string; driverId: string | null; companyId: string | null }
export type CommandResponse = { status: number; body: JsonValue; headers?: { ETag?: string; Location?: string } }
export type AuditChange = { entityType: string; entityId: string; action: string; before?: { [key: string]: JsonValue }; after?: { [key: string]: JsonValue } }
export type CommandOutcome = { outcome: 'succeeded' | 'rejected'; response: CommandResponse; audit: AuditChange[] }
export type CommandInput = {
  accessToken: string
  serializeAccountStatus?: true
  method: 'POST' | 'PATCH' | 'DELETE'
  canonicalPath: string
  key: string
  request: JsonValue
  requestId: string
  ifMatch?: string
  authorize: (transaction: WorkflowTransaction, actor: CommandActor) => Promise<void>
  execute: (transaction: WorkflowTransaction, actor: CommandActor) => Promise<CommandOutcome>
}
export type CommandResult = { replayed: boolean; response: CommandResponse }
