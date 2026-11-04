import { describe, expect, it } from 'vitest'
import { backupName, backupStamp, canCopyCollection, MAX_COLLECTION_NAME_LENGTH, validateTargetName } from '../src/runtime/utils/collectionCopy'

describe('validateTargetName', () => {
  const existing = ['orders', 'Users', 'archive.2024']

  it('accepts a plain new name', () => {
    expect(validateTargetName('orders_backup', 'orders', existing)).toBeUndefined()
    expect(validateTargetName('  orders-2025  ', 'orders', existing)).toBeUndefined()
    expect(validateTargetName('a.b-c_d', 'orders', existing)).toBeUndefined()
  })

  it('refuses an empty or too long name', () => {
    expect(validateTargetName('', 'orders', existing)).toBe('empty')
    expect(validateTargetName('   ', 'orders', existing)).toBe('empty')
    expect(validateTargetName('a'.repeat(MAX_COLLECTION_NAME_LENGTH + 1), 'orders', existing)).toBe('too-long')
    expect(validateTargetName('a'.repeat(MAX_COLLECTION_NAME_LENGTH), 'orders', existing)).toBeUndefined()
  })

  it('refuses characters outside letters, digits, _ - . (and a leading dot or dash)', () => {
    for (const bad of ['a b', 'a$b', 'a/b', 'a\u0000b', 'ä', '.hidden', '-x', 'a\nb', 'a%20b']) expect(validateTargetName(bad, 'orders', existing)).toBe('invalid-characters')
  })

  it('refuses MongoCamp-internal, GridFS and system names', () => {
    for (const name of ['mc_users', 'mc_', 'photos.files', 'photos.chunks', 'system.views']) expect(validateTargetName(name, 'orders', existing)).toBe('protected')
  })

  it('refuses the source itself and any name that exists, ignoring case', () => {
    expect(validateTargetName('orders', 'orders', existing)).toBe('same-as-source')
    expect(validateTargetName('ORDERS', 'orders', existing)).toBe('same-as-source')
    expect(validateTargetName('users', 'orders', existing)).toBe('exists')
    expect(validateTargetName('archive.2024', 'orders', existing)).toBe('exists')
  })
})

describe('canCopyCollection', () => {
  it('offers only ordinary collections', () => {
    expect(canCopyCollection('orders')).toBe(true)
    for (const name of ['mc_users', 'photos.files', 'photos.chunks', 'system.profile']) expect(canCopyCollection(name)).toBe(false)
  })
})

describe('backupName', () => {
  const now = new Date(2026, 10, 4, 9, 5, 7) // local time: 4 Nov 2026 09:05:07

  it('writes a sortable local timestamp', () => {
    expect(backupStamp(now)).toBe('20261104_090507')
    expect(backupName('orders', [], now)).toBe('orders_backup_20261104_090507')
  })

  it('counts up when the name exists, ignoring case', () => {
    const first = 'orders_backup_20261104_090507'
    expect(backupName('orders', [first], now)).toBe(`${first}_2`)
    expect(backupName('orders', [first.toUpperCase(), `${first}_2`], now)).toBe(`${first}_3`)
  })

  it('makes a valid name out of a source with odd characters', () => {
    for (const source of ['my orders', 'a$b', 'ünï', '.hidden', '-x', 'a/b', '...']) {
      const name = backupName(source, ['orders'], now)
      expect(validateTargetName(name, source, ['orders']), `${source} → ${name}`).toBeUndefined()
      expect(name).toMatch(/_backup_20261104_090507$/)
    }
  })

  it('shortens a long source and still stays within the limit, also with a counter', () => {
    const long = 'x'.repeat(MAX_COLLECTION_NAME_LENGTH + 20)
    const name = backupName(long, [], now)
    expect(name.length).toBe(MAX_COLLECTION_NAME_LENGTH)
    expect(name.endsWith('_backup_20261104_090507')).toBe(true)
    const second = backupName(long, [name], now)
    expect(second.length).toBeLessThanOrEqual(MAX_COLLECTION_NAME_LENGTH)
    expect(second).not.toBe(name)
    expect(validateTargetName(second, long, [name])).toBeUndefined()
  })

  it('gives a different name every second', () => {
    expect(backupName('orders', [], new Date(2026, 10, 4, 9, 5, 8))).not.toBe(backupName('orders', [], now))
  })
})
