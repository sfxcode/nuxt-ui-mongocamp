import { describe, expect, it } from 'vitest'
import { groupCollectionNames } from '../src/runtime/utils/collectionNames'

describe('groupCollectionNames', () => {
  it('splits ordinary collections, buckets and MongoCamp\'s own, each sorted', () => {
    expect(groupCollectionNames(['zebra', 'mc_users', 'images.chunks', 'images.files', 'apple', 'mc_roles', 'fs.files'])).toEqual({
      collections: ['apple', 'zebra'],
      buckets: ['fs', 'images'],
      system: ['mc_roles', 'mc_users'],
    })
  })

  it('lists a bucket once, also when only one half is present', () => {
    expect(groupCollectionNames(['a.chunks', 'b.files', 'b.chunks']).buckets).toEqual(['a', 'b'])
  })

  it('keeps a mc_ name in system even when it looks like a bucket half', () => {
    expect(groupCollectionNames(['mc_files.files'])).toEqual({ collections: [], buckets: [], system: ['mc_files.files'] })
  })

  it('treats look-alikes as ordinary collections', () => {
    expect(groupCollectionNames(['files', 'my_files', 'files.backup', 'MC_users']).collections).toEqual(['files', 'files.backup', 'MC_users', 'my_files'])
  })

  it('drops duplicates and empty names, and leaves the input alone', () => {
    const input = ['b', 'a', 'b', '']
    expect(groupCollectionNames(input).collections).toEqual(['a', 'b'])
    expect(input).toEqual(['b', 'a', 'b', ''])
    expect(groupCollectionNames([])).toEqual({ collections: [], buckets: [], system: [] })
  })
})
