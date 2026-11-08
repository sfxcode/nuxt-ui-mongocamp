import { describe, expect, it } from 'vitest'
import {
  buildIndexRequest, canDropIndex, classifyIndexError, describeKey, formatBytes, indexKeys, isExpiringIndex, isTextIndex, isUnusedIndex, isValidExpireAfter,
  MAX_INDEX_FIELDS, parsePartialFilter, validateIndexForm,
} from '../src/runtime/utils/indexForm'
import type { IndexForm } from '../src/runtime/utils/indexForm'

describe('indexKeys', () => {
  it('reads the ordered keys the server lists (recorded on 1.8.1)', () => {
    // created as { name: 1, n: -1 } with the name my_idx — the order survives in the listing now, whatever the name says
    expect(indexKeys({ keys: [{ field: 'name', direction: '1' }, { field: 'n', direction: '-1' }] })).toEqual([{ field: 'name', direction: 1 }, { field: 'n', direction: -1 }])
    expect(indexKeys({ keys: [{ field: 'b', direction: '1' }, { field: 'a', direction: '1' }] }).map(k => k.field)).toEqual(['b', 'a'])
  })

  it('reads the fields of a text index straight from its keys', () => {
    expect(indexKeys({ keys: [{ field: 'name', direction: 'text' }, { field: 't', direction: 'text' }] })).toEqual([{ field: 'name', direction: 'text' }, { field: 't', direction: 'text' }])
  })

  it('marks a direction that is neither 1, -1 nor text, and copes with no keys', () => {
    expect(indexKeys({ keys: [{ field: 'z', direction: '5' }] })).toEqual([{ field: 'z', direction: 'other' }])
    expect(indexKeys({})).toEqual([])
  })

  it('tells text and expiring indexes apart', () => {
    expect(isTextIndex({ keys: [{ field: 'a', direction: 'text' }] })).toBe(true)
    expect(isTextIndex({ keys: [{ field: 'a', direction: '1' }] })).toBe(false)
    expect(isExpiringIndex({ expireAfterSeconds: 3600 })).toBe(true)
    expect(isExpiringIndex({ expireAfterSeconds: null })).toBe(false)
    expect(isExpiringIndex({})).toBe(false)
  })

  it('describes keys', () => {
    expect(describeKey({ field: 'a', direction: 1 })).toBe('a: ↑')
    expect(describeKey({ field: 'a', direction: -1 })).toBe('a: ↓')
    expect(describeKey({ field: 'a', direction: 'text' })).toBe('a (text)')
  })
})

describe('formatBytes', () => {
  it('scales', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(4096)).toBe('4.0 KB')
    expect(formatBytes(20480)).toBe('20 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('expire duration', () => {
  it('accepts a number and a unit', () => {
    for (const ok of ['3600s', '1d', '30m', '12h', ' 5s ']) expect(isValidExpireAfter(ok)).toBe(true)
    for (const bad of ['', '0s', '-1s', '1', 'd', '1w', '1.5h', '3600 s', '9999999999s']) expect(isValidExpireAfter(bad)).toBe(false)
  })
})

const form = (patch: Partial<IndexForm> = {}): IndexForm => ({ kind: 'standard', fields: [{ field: 'a', descending: false }], name: '', expireAfter: '3600s', sparse: false, hidden: false, partialFilter: '', ...patch })

describe('validateIndexForm', () => {
  it('accepts a plain form', () => {
    expect(validateIndexForm(form())).toEqual([])
  })

  it('finds missing, empty and repeated fields and too many', () => {
    expect(validateIndexForm(form({ fields: [] }))).toEqual(['no-field'])
    expect(validateIndexForm(form({ fields: [{ field: ' ', descending: false }] }))).toContain('empty-field')
    expect(validateIndexForm(form({ fields: [{ field: 'a', descending: false }, { field: 'a', descending: true }] }))).toContain('duplicate-field')
    const many = Array.from({ length: MAX_INDEX_FIELDS + 1 }, (_, i) => ({ field: `f${i}`, descending: false }))
    expect(validateIndexForm(form({ fields: many }))).toContain('too-many-fields')
  })

  it('checks the duration only for an expiring index, and only its first field', () => {
    expect(validateIndexForm(form({ kind: 'expiring', expireAfter: 'soon' }))).toEqual(['bad-duration'])
    expect(validateIndexForm(form({ kind: 'standard', expireAfter: 'soon' }))).toEqual([])
    expect(validateIndexForm(form({ kind: 'expiring', fields: [{ field: 'a', descending: false }, { field: '', descending: false }] }))).toEqual([])
  })

  it('checks every field of a text index (it may span several)', () => {
    expect(validateIndexForm(form({ kind: 'text', fields: [{ field: 'a', descending: false }, { field: '', descending: false }] }))).toEqual(['empty-field'])
    expect(validateIndexForm(form({ kind: 'text', fields: [{ field: 'a', descending: false }, { field: 'b', descending: false }] }))).toEqual([])
  })

  it('wants the partial filter to be a JSON object, and refuses it together with sparse', () => {
    expect(validateIndexForm(form({ partialFilter: '{ "status": "active" }' }))).toEqual([])
    for (const bad of ['status:active', '[1]', '{}', '"x"', '{ broken']) expect(validateIndexForm(form({ partialFilter: bad }))).toEqual(['bad-partial-filter'])
    expect(validateIndexForm(form({ sparse: true, partialFilter: '{ "a": 1 }' }))).toEqual(['sparse-and-partial'])
    expect(validateIndexForm(form({ sparse: true }))).toEqual([])
  })

  it('leaves the options alone for an expiring index', () => {
    expect(validateIndexForm(form({ kind: 'expiring', partialFilter: 'nonsense', sparse: true }))).toEqual([])
  })

  it('refuses an overlong name', () => {
    expect(validateIndexForm(form({ name: 'n'.repeat(101) }))).toEqual(['bad-name'])
  })
})

describe('parsePartialFilter', () => {
  it('is undefined for empty, null for anything that is not a non-empty JSON object', () => {
    expect(parsePartialFilter('  ')).toBeUndefined()
    expect(parsePartialFilter('{ "a": { "$gt": 0 } }')).toEqual({ a: { $gt: 0 } })
    expect(parsePartialFilter('[]')).toBeNull()
  })
})

describe('buildIndexRequest', () => {
  it('builds a compound index with ordered keys and directions as text', () => {
    expect(buildIndexRequest(form({ fields: [{ field: ' c ', descending: false }, { field: 'b', descending: true }] }))).toEqual({
      call: 'createOrderedIndex',
      keys: [{ field: 'c', direction: '1' }, { field: 'b', direction: '-1' }],
    })
  })

  it('sets unique, a name, sparse, hidden and the partial filter through the options', () => {
    expect(buildIndexRequest(form({ kind: 'unique', name: ' mine ' }))).toEqual({ call: 'createOrderedIndex', keys: [{ field: 'a', direction: '1' }], options: { unique: true, name: 'mine' } })
    expect(buildIndexRequest(form({ sparse: true, hidden: true }))).toEqual({ call: 'createOrderedIndex', keys: [{ field: 'a', direction: '1' }], options: { sparse: true, hidden: true } })
    expect(buildIndexRequest(form({ partialFilter: '{ "n": { "$gt": 0 } }' }))).toEqual({ call: 'createOrderedIndex', keys: [{ field: 'a', direction: '1' }], options: { partialFilterExpression: { n: { $gt: 0 } } } })
  })

  it('builds a text index over several fields, whatever the directions say', () => {
    expect(buildIndexRequest(form({ kind: 'text', fields: [{ field: 'a', descending: true }, { field: 'b', descending: false }] }))).toEqual({
      call: 'createOrderedIndex',
      keys: [{ field: 'a', direction: 'text' }, { field: 'b', direction: 'text' }],
    })
  })

  it('uses the dedicated call for an expiring index', () => {
    expect(buildIndexRequest(form({ kind: 'expiring', expireAfter: ' 1d ' }))).toEqual({ call: 'createExpiringIndex', field: 'a', duration: '1d' })
  })
})

describe('classifyIndexError', () => {
  it('recognises the recorded server messages', () => {
    expect(classifyIndexError('Write failed with error code 11000 and error message \'Index build failed: … E11000 duplicate key error\'')).toBe('duplicate-values')
    expect(classifyIndexError('An equivalent index already exists with the same name but different options.')).toBe('conflict')
    expect(classifyIndexError('Error in specification { key: {}, name: "" } :: caused by :: Index keys cannot be empty.')).toBe('empty-keys')
    expect(classifyIndexError('something else')).toBe('other')
  })
})

describe('guards', () => {
  it('never drops or flags _id_', () => {
    expect(canDropIndex('_id_')).toBe(false)
    expect(canDropIndex('a_1')).toBe(true)
    expect(isUnusedIndex('_id_', 0)).toBe(false)
    expect(isUnusedIndex('a_1', 0)).toBe(true)
    expect(isUnusedIndex('a_1', 3)).toBe(false)
    expect(isUnusedIndex('a_1', undefined)).toBe(false)
  })
})
