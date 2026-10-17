import { readdir, readFile } from 'node:fs/promises'

let hasErrors = false
for (const directory of ['src', 'tests', 'scripts']) {
  for (const file of await readdir(directory, { recursive: true })) {
    if (file.startsWith('generated/')) continue
    const name = file.split('/').at(-1)
    if (/\.(?:ts|mjs)$/.test(name) && !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.integration)?(?:\.test)?\.(?:ts|mjs)$/.test(name)) {
      console.error(`Invalid source filename: ${directory}/${file}`)
      hasErrors = true
    }
  }
}
for (const directory of await readdir('prisma/migrations')) {
  if (directory === 'migration_lock.toml') continue
  const sql = await readFile(`prisma/migrations/${directory}/migration.sql`, 'utf8')
  for (const [, identifier] of sql.matchAll(/"([^"]+)"/g)) {
    if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(identifier) || identifier.length > 63) {
      console.error(`Invalid SQL identifier: ${identifier}`)
      hasErrors = true
    }
  }
}
if (hasErrors) process.exitCode = 1
