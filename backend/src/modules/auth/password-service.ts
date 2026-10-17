import { hash, verify, argon2id } from 'argon2'
import { HttpError } from '../../shared/http/http-error.ts'

// Bound concurrent memory-hard work; overload fails instead of growing an unbounded queue.
let activeHashes = 0
async function withHashCapacity<T>(operation: () => Promise<T>) {
  if (activeHashes >= 4) throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Authentication is busy. Try again later.')
  activeHashes++
  try { return await operation() } finally { activeHashes-- }
}
export function hashPassword(password: string) {
  return withHashCapacity(() => hash(password, { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 }))
}
export function verifyPassword(passwordHash: string, password: string) {
  return withHashCapacity(() => verify(passwordHash, password))
}
