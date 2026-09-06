import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const from = resolve('dist/assets')
const to = resolve('assets')

mkdirSync(to, { recursive: true })
for (const name of readdirSync(to)) {
  rmSync(resolve(to, name), { force: true })
}
for (const name of readdirSync(from)) {
  if (name.endsWith('.map')) continue
  cpSync(resolve(from, name), resolve(to, name))
}
