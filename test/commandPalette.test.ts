import { describe, it, expect } from 'vitest'
import { buildActions, buildEntries, isFresh } from '../src/runtime/utils/commandPalette'
import type { PalettePaths } from '../src/runtime/utils/commandPalette'

const paths: PalettePaths = {
  collectionPath: '/c/', bucketPath: '/b', usersPath: '/u', rolePath: '/r', jobsPath: '/j', settingsPath: '/s', accountPath: '/a',
}

describe('buildEntries', () => {
  it('turns collections, buckets, users, roles and jobs into entries with routes', () => {
    const entries = buildEntries({
      collections: ['orders', 'photos.files', 'photos.chunks', 'mc_users', 'a b'],
      users: ['ann'], roles: ['reader'], jobs: [{ name: 'nightly', group: 'ops' }],
    }, paths)
    expect(entries.map(e => [e.id, e.to])).toEqual([
      ['collection:orders', '/c/orders/data'],
      ['bucket:photos', '/b/photos'],
      ['collection:a b', '/c/a%20b/data'],
      ['user:ann', '/u'],
      ['role:reader', '/r/reader'],
      ['job:ops/nightly', '/j'],
    ])
    expect(entries.find(e => e.kind === 'job')?.description).toBe('ops')
  })

  it('hides what the user cannot read', () => {
    const entries = buildEntries({ collections: ['orders', 'secret', 'photos.files'] }, paths, { canRead: c => c === 'orders' })
    expect(entries.map(e => e.id)).toEqual(['collection:orders'])
  })

  it('copes with missing sources', () => {
    expect(buildEntries({}, paths)).toEqual([])
  })
})

describe('buildActions', () => {
  it('offers settings only to administrators', () => {
    expect(buildActions(paths, { isAdmin: false }).map(a => a.id)).toEqual(['action:account', 'action:refresh', 'action:logout'])
    expect(buildActions(paths, { isAdmin: true }).map(a => a.id)).toContain('action:settings')
  })
})

describe('isFresh', () => {
  it('is fresh only inside the TTL', () => {
    expect(isFresh(undefined, 1000, 500)).toBe(false)
    expect(isFresh(1000, 1400, 500)).toBe(true)
    expect(isFresh(1000, 1500, 500)).toBe(false)
    expect(isFresh(2000, 1000, 500)).toBe(false)
  })
})
