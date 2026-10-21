// Explicit live opt-in: real disposable PostgreSQL and loopback S3 transport.
process.env.TEST_DOCUMENTS_LIVE = 'true'
await import('../integration/documents.integration.test.ts')
