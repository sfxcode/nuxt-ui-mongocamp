#!/usr/bin/env node
// Checks what a real MongoCamp server answers — as RAW TEXT.
//
//   node scripts/mongocamp-probe.mjs GET /version
//   node scripts/mongocamp-probe.mjs GET '/mongodb/collections/orders/documents/count?filter=status:open'
//   node scripts/mongocamp-probe.mjs POST /mongodb/collections/orders/aggregate '{"pipeline":[{"stage":"$count","value":"c"}],"allowDiskUse":false}'
//
// Reads MONGOCAMP_URL / MONGOCAMP_ADMIN_USER / MONGOCAMP_ADMIN_PASSWORD from playground/.env (or the environment), logs in
// as that admin and prints the status, the interesting headers and the response BODY EXACTLY AS RECEIVED. Never print a
// value the generated client parsed: its `JSON.parse` rounds integers beyond 2^53, which once made a server look broken
// (see brain/principles.md). Use scratch collections (zz_*) for anything that writes, and drop them afterwards.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function readEnv() {
  const env = { ...process.env }
  try {
    for (const line of readFileSync(join(root, 'playground/.env'), 'utf8').split('\n')) {
      const i = line.indexOf('=')
      if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  }
  catch {
    // no playground/.env: the environment must hold the values
  }
  return env
}

const [method, path, body] = process.argv.slice(2)
if (!method || !path) {
  console.error('usage: node scripts/mongocamp-probe.mjs <METHOD> <path> [json body]')
  process.exit(2)
}

const env = readEnv()
const base = env.MONGOCAMP_URL
if (!base) {
  console.error('MONGOCAMP_URL is not set (playground/.env or the environment)')
  process.exit(2)
}

const headers = { 'content-type': 'application/json' }
if (path !== '/version' && env.MONGOCAMP_ADMIN_USER) {
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers, body: JSON.stringify({ userId: env.MONGOCAMP_ADMIN_USER, password: env.MONGOCAMP_ADMIN_PASSWORD }) })
  const token = (await login.json()).authToken
  if (!token) {
    console.error(`login failed (${login.status})`)
    process.exit(1)
  }
  headers.authorization = `Bearer ${token}`
}

const response = await fetch(`${base}${path}`, { method, headers, body })
const text = await response.text()
const shown = ['content-type', 'content-length', 'transfer-encoding', 'content-disposition', 'x-pagination-count-rows', 'access-control-allow-origin']
  .flatMap(name => (response.headers.get(name) === null ? [] : [`${name}: ${response.headers.get(name)}`]))
console.log(`${response.status} ${response.statusText}`)
for (const line of shown) console.log(line)
console.log('')
console.log(text)
