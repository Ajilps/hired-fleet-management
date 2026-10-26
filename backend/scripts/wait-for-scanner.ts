import { setTimeout } from 'node:timers/promises'
import { createClamAvScanner, readScannerConfig } from '../src/modules/files/clamav-scanner.ts'

// A successful clamd ping can precede Freshclam's first signature reload.
// Use the upload client's freshness and clean-verdict checks before live tests.
const scanner = createClamAvScanner(readScannerConfig(process.env))
const deadline = Date.now() + 180_000
const document = Buffer.from('%PDF-1.4\nSynthetic scanner readiness document\n%%EOF\n')

console.log('Waiting for ClamAV to load current signatures and scan a synthetic document.')
while (true) {
  try {
    if (await scanner.scan(document) !== 'clean') throw new Error('Synthetic readiness document was rejected.')
    console.log('ClamAV is ready with current signatures.')
    break
  } catch (error) {
    if (Date.now() >= deadline) throw error
    await setTimeout(2000)
  }
}
