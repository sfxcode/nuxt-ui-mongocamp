import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as publicUtils from '../src/runtime/publicUtils'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))

describe('@sfxcode/nuxt-ui-mongocamp/utils', () => {
  // A deliberate snapshot of the public surface: adding or removing a name here is an API change.
  it('exports exactly the documented helpers', () => {
    expect(Object.keys(publicUtils).sort()).toEqual([
      'bucketNameOf',
      'connectionUsage',
      'formatBytes',
      'formatCount',
      'formatUptime',
      'isBucketMemberCollection',
      'isProtectedCollection',
    ])
  })

  it('the helpers work through the public entry', () => {
    expect(publicUtils.formatBytes(1536)).toBe('1.5 KB')
    expect(publicUtils.formatUptime(3 * 86400 + 4 * 3600)).toBe('3d 4h')
    expect(publicUtils.formatCount(1234567)).toBe('1 234 567')
    expect(publicUtils.connectionUsage(25, 75)).toBe(25)
    expect(publicUtils.isProtectedCollection('mc_users')).toBe(true)
    expect(publicUtils.bucketNameOf('images.files')).toBe('images')
  })

  it('package.json points the ./utils export at the built entry', () => {
    expect(pkg.exports['./utils']).toEqual({ types: './dist/runtime/publicUtils.d.ts', import: './dist/runtime/publicUtils.js' })
    expect(pkg.typesVersions['*'].utils).toEqual(['./dist/runtime/publicUtils.d.ts'])
  })
})
