import { describe, expect, it } from 'vitest'
import {
  buildIndexRequest, canDropIndex, classifyIndexError, describeKey, formatBytes, indexKeys, isUnusedIndex, isValidExpireAfter,
  MAX_INDEX_FIELDS, validateIndexForm,
} from '../src/runtime/utils/indexForm'
import type { IndexForm } from '../src/runtime/utils/indexForm'

describe('indexKeys', () => {
  it('restores the order of a compound index from its name (the server lists keys unordered)', () => {
    // recorded: created as { c: 1, b: 1 }, listed as { b: 1, c: 1 }, named c_1_b_1
    expect(indexKeys({ name: 'c_1_b_1', keys: { b: 1, c: 1 } }).map(k => k.field)).toEqual(['c', 'b'])
    expect(indexKeys({ name: 'a_1_b_-1', keys: { a: 1, b: -1 } })).toEqual([{ field: 'a', direction: 1 }, { field: 'b', direction: -1 }])
  })

  it('handles fields that contain underscores and dots', () => {
    expect(indexKeys({ name: 'user_id_1_a.b_-1', keys: { 'a.b': -1, 'user_id': 1 } }).map(k => k.field)).toEqual(['user_id', 'a.b'])
  })

  it('keeps the listed order for a custom name or a single key', () => {
    expect(indexKeys({ name: 'my_idx', keys: { x: 1, y: -1 } }).map(k => k.field)).toEqual(['x', 'y'])
    expect(indexKeys({ name: 'when_1', keys: { when: 1 } })).toEqual([{ field: 'when', direction: 1 }])
  })

  it('shows the fields of a text index from its weights, not the internal keys', () => {
    expect(indexKeys({ name: 'body_text', text: true, keys: { _ftsx: 1, _fts: 'text' }, weights: { body: 1 } })).toEqual([{ field: 'body', direction: 'text' }])
  })

  it('marks a direction that is neither 1 nor -1', () => {
    expect(indexKeys({ name: 'z_5', keys: { z: 5 } })).toEqual([{ field: 'z', direction: 'other' }])
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

const form = (patch: Partial<IndexForm> = {}): IndexForm => ({ kind: 'standard', fields: [{ field: 'a', descending: false }], name: '', expireAfter: '3600s', ...patch })

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

  it('checks the duration only for an expiring index, and only the first field of text/expiring', () => {
    expect(validateIndexForm(form({ kind: 'expiring', expireAfter: 'soon' }))).toEqual(['bad-duration'])
    expect(validateIndexForm(form({ kind: 'standard', expireAfter: 'soon' }))).toEqual([])
    expect(validateIndexForm(form({ kind: 'text', fields: [{ field: 'a', descending: false }, { field: '', descending: false }] }))).toEqual([])
  })

  it('refuses an overlong name', () => {
    expect(validateIndexForm(form({ name: 'n'.repeat(101) }))).toEqual(['bad-name'])
  })
})

describe('buildIndexRequest', () => {
  it('builds a compound standard index with directions in field order', () => {
    expect(buildIndexRequest(form({ fields: [{ field: ' c ', descending: false }, { field: 'b', descending: true }] }))).toEqual({ call: 'createIndex', keys: { c: 1, b: -1 } })
  })

  it('sets unique and a name through the options', () => {
    expect(buildIndexRequest(form({ kind: 'unique', name: ' mine ' }))).toEqual({ call: 'createIndex', keys: { a: 1 }, options: { unique: true, name: 'mine' } })
    expect(buildIndexRequest(form({ name: 'only_name' }))).toEqual({ call: 'createIndex', keys: { a: 1 }, options: { name: 'only_name' } })
  })

  it('uses the single-field calls for text and expiring', () => {
    expect(buildIndexRequest(form({ kind: 'text' }))).toEqual({ call: 'createTextIndex', field: 'a' })
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
