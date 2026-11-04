import { describe, expect, it } from 'vitest'
import { clearPersisted, PERSISTED_STATE_MAX_BYTES, readPersisted, writePersisted } from '../src/runtime/utils/persistedState'
import type { StorageLike } from '../src/runtime/utils/persistedState'

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: k => void data.delete(k),
  }
}

const throwing: StorageLike = {
  getItem: () => { throw new Error('blocked') },
  setItem: () => { throw new Error('full') },
  removeItem: () => { throw new Error('blocked') },
}

describe('persistedState', () => {
  it('round-trips a value in a versioned envelope', () => {
    const s = memory()
    expect(writePersisted(s, 'k', { a: 1 })).toBe(true)
    expect(JSON.parse(s.data.get('k')!)).toEqual({ v: 1, data: { a: 1 } })
    expect(readPersisted(s, 'k')).toEqual({ a: 1 })
  })

  it('returns undefined for nothing, corrupt JSON, a non-envelope or a newer version', () => {
    const s = memory()
    expect(readPersisted(s, 'k')).toBeUndefined()
    s.data.set('k', '{oops')
    expect(readPersisted(s, 'k')).toBeUndefined()
    s.data.set('k', '[1]')
    expect(readPersisted(s, 'k')).toBeUndefined()
    s.data.set('k', JSON.stringify({ v: 2, data: { a: 1 } }))
    expect(readPersisted(s, 'k')).toBeUndefined()
  })

  it('migrates an older version and drops it when there is no migration', () => {
    const s = memory()
    s.data.set('k', JSON.stringify({ v: 1, data: { size: 5 } }))
    expect(readPersisted(s, 'k', { version: 2 })).toBeUndefined()
    expect(readPersisted<{ pageSize: number }>(s, 'k', { version: 2, migrate: d => ({ pageSize: (d as { size: number }).size }) })).toEqual({ pageSize: 5 })
  })

  it('rejects data that fails validation', () => {
    const s = memory()
    writePersisted(s, 'k', { a: 'x' })
    expect(readPersisted(s, 'k', { validate: (d): d is { a: number } => typeof (d as { a: unknown }).a === 'number' })).toBeUndefined()
  })

  it('does not store an oversized value', () => {
    const s = memory()
    expect(writePersisted(s, 'k', { big: 'x'.repeat(PERSISTED_STATE_MAX_BYTES) })).toBe(false)
    expect(s.data.size).toBe(0)
  })

  it('never throws when storage is missing or throws', () => {
    expect(readPersisted(undefined, 'k')).toBeUndefined()
    expect(writePersisted(undefined, 'k', 1)).toBe(false)
    expect(readPersisted(throwing, 'k')).toBeUndefined()
    expect(writePersisted(throwing, 'k', 1)).toBe(false)
    expect(() => clearPersisted(throwing, 'k')).not.toThrow()
  })

  it('clears an entry', () => {
    const s = memory()
    writePersisted(s, 'k', { a: 1 })
    clearPersisted(s, 'k')
    expect(readPersisted(s, 'k')).toBeUndefined()
  })
})
