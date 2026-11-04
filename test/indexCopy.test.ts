import { describe, expect, it } from 'vitest'
import { planIndexCopies, planIndexCopy } from '../src/runtime/utils/indexCopy'
import { indexKeysWithOrder } from '../src/runtime/utils/indexForm'

// shapes recorded from server 1.6.3 (live spike 2026-11-04)
const idx = (patch: Record<string, unknown>) => ({ name: 'x', keys: {}, unique: false, text: false, expire: false, expireAfterSeconds: -1, weights: {}, ...patch })

describe('indexKeysWithOrder', () => {
  it('knows the order of one key, a text index and a standard-named compound index', () => {
    expect(indexKeysWithOrder(idx({ name: 'a_1', keys: { a: 1 } })).orderKnown).toBe(true)
    expect(indexKeysWithOrder(idx({ name: 'body_text', text: true, keys: { _fts: 'text' }, weights: { body: 1 } })).orderKnown).toBe(true)
    expect(indexKeysWithOrder(idx({ name: 'c_1_b_1', keys: { b: 1, c: 1 } }))).toMatchObject({ orderKnown: true, keys: [{ field: 'c' }, { field: 'b' }] })
  })

  it('does not know the order of a custom-named compound index', () => {
    expect(indexKeysWithOrder(idx({ name: 'my_idx', keys: { b: 1, c: 1 } })).orderKnown).toBe(false)
  })
})

describe('planIndexCopy', () => {
  it('copies a single-field index with its name', () => {
    expect(planIndexCopy(idx({ name: 'name_1', keys: { name: 1 } }))).toEqual({ call: 'createIndex', name: 'name_1', keys: { name: 1 }, options: { name: 'name_1' } })
    expect(planIndexCopy(idx({ name: 'age_-1', keys: { age: -1 } }))).toMatchObject({ keys: { age: -1 } })
  })

  it('keeps the field order of a compound index and its unique flag', () => {
    const plan = planIndexCopy(idx({ name: 'c_1_b_-1', keys: { b: -1, c: 1 }, unique: true }))
    expect(plan).toEqual({ call: 'createIndex', name: 'c_1_b_-1', keys: { c: 1, b: -1 }, options: { name: 'c_1_b_-1', unique: true } })
    expect(Object.keys((plan as { keys: object }).keys)).toEqual(['c', 'b'])
  })

  it('keeps the expiry as seconds', () => {
    expect(planIndexCopy(idx({ name: 'when_1', keys: { when: 1 }, expire: true, expireAfterSeconds: 3600 }))).toEqual({ call: 'createIndex', name: 'when_1', keys: { when: 1 }, options: { name: 'when_1', expireAfter: '3600s' } })
    expect(planIndexCopy(idx({ name: 'when_1', keys: { when: 1 }, expire: true, expireAfterSeconds: 0 }))).toMatchObject({ options: { expireAfter: '0s' } })
  })

  it('copies a one-field text index with the text call', () => {
    expect(planIndexCopy(idx({ name: 'body_text', text: true, keys: { _ftsx: 1, _fts: 'text' }, weights: { body: 1 } }))).toEqual({ call: 'createTextIndex', name: 'body_text', field: 'body' })
  })

  it('skips what cannot be reproduced, with the reason', () => {
    expect(planIndexCopy(idx({ name: 't', text: true, keys: { _fts: 'text' }, weights: { a: 1, b: 1 } }))).toEqual({ call: 'skip', name: 't', reason: 'multi-field-text' })
    expect(planIndexCopy(idx({ name: 't', text: true, keys: { _fts: 'text' }, weights: { a: 5 } }))).toEqual({ call: 'skip', name: 't', reason: 'custom-weights' })
    expect(planIndexCopy(idx({ name: 'z_5', keys: { z: 5 } }))).toEqual({ call: 'skip', name: 'z_5', reason: 'unsupported-key' })
    expect(planIndexCopy(idx({ name: 'geo', keys: { loc: '2dsphere' } }))).toEqual({ call: 'skip', name: 'geo', reason: 'unsupported-key' })
    expect(planIndexCopy(idx({ name: 'mine', keys: { b: 1, c: 1 } }))).toEqual({ call: 'skip', name: 'mine', reason: 'unknown-key-order' })
    expect(planIndexCopy(idx({ name: 'empty', keys: {} }))).toEqual({ call: 'skip', name: 'empty', reason: 'unsupported-key' })
  })

  it('leaves out the _id index', () => {
    const plans = planIndexCopies([idx({ name: '_id_', keys: { _id: 1 } }), idx({ name: 'a_1', keys: { a: 1 } })])
    expect(plans.map(p => p.name)).toEqual(['a_1'])
  })
})
