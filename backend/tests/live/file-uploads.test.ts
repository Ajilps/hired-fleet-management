// Explicit live entry point; production has no provider-bypass setting.
process.env.TEST_FILES_LIVE = 'true'
await import('../integration/file-uploads.integration.test.ts')
