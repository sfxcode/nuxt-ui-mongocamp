import { describe, expect, it } from 'vitest'
import { DEFAULT_PATHS, resolvePaths } from '../src/runtime/utils/paths'

describe('resolvePaths', () => {
  it('returns the defaults without a configuration', () => {
    expect(resolvePaths()).toEqual(DEFAULT_PATHS)
    expect(resolvePaths(null)).toEqual(DEFAULT_PATHS)
    expect(resolvePaths('nope')).toEqual(DEFAULT_PATHS)
    expect(DEFAULT_PATHS.collections).toBe('/secured/admin/collections')
    expect(DEFAULT_PATHS.account).toBe('/secured/account')
  })

  it('overrides only the configured keys', () => {
    expect(resolvePaths({ collections: '/db/collections', account: '/me' })).toEqual({
      ...DEFAULT_PATHS,
      collections: '/db/collections',
      account: '/me',
    })
  })

  it('keeps the default for an empty, blank or non-text entry and drops unknown keys', () => {
    const paths = resolvePaths({ users: '', roles: '   ', jobs: 5, settings: null, other: '/x' })

    expect(paths).toEqual(DEFAULT_PATHS)
    expect(paths).not.toHaveProperty('other')
  })

  it('removes trailing slashes — the components append the name themselves — but keeps a bare /', () => {
    expect(resolvePaths({ collections: '/c/', buckets: ' /b// ', users: '/' })).toMatchObject({ collections: '/c', buckets: '/b', users: '/' })
  })

  it('never hands out the shared defaults object', () => {
    const paths = resolvePaths()
    paths.users = '/changed'

    expect(resolvePaths().users).toBe('/secured/admin/users')
    expect(Object.isFrozen(DEFAULT_PATHS)).toBe(true)
  })
})
