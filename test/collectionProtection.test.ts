import { describe, it, expect } from 'vitest'
import { isProtectedCollection, isBucketMemberCollection } from '../src/runtime/utils/collectionProtection'

describe('isProtectedCollection', () => {
  it.each(['mc_users', 'mc_roles', 'mc_'])('protects the MongoCamp system collection %s', (name) => {
    expect(isProtectedCollection(name)).toBe(true)
  })

  it.each(['fs.files', 'fs.chunks', 'test_images.files', 'a.b.chunks'])('protects the GridFS member %s', (name) => {
    expect(isProtectedCollection(name)).toBe(true)
  })

  it.each(['test_customer', 'files', 'chunks', 'my_files', 'profiles.filesystem', 'files.backup', 'MC_users', 'xmc_users'])('leaves %s alone', (name) => {
    expect(isProtectedCollection(name)).toBe(false)
  })
})

describe('isBucketMemberCollection', () => {
  it('matches only a .files or .chunks suffix', () => {
    expect(isBucketMemberCollection('fs.files')).toBe(true)
    expect(isBucketMemberCollection('fs.chunks')).toBe(true)
    expect(isBucketMemberCollection('fs')).toBe(false)
    expect(isBucketMemberCollection('mc_users')).toBe(false)
  })
})
