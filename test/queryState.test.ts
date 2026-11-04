import { describe, expect, it } from 'vitest'
import {
  addSort, describeQuery, emptyQueryState, formatSortEntry, fromSavedQuery, isEmptyQuery, MAX_SORT_ENTRIES, parseSortEntry,
  removeSort, setSortField, toggleProjectionField, toggleSortDirection, toSavedQuery, usableProjection,
} from '../src/runtime/utils/queryState'
import type { QueryState } from '../src/runtime/utils/queryState'

const group = { match: 'all' as const, conditions: [{ id: 'c1', field: 'name', operator: 'equals' as const, value: 'Alice' }] }
const types = { name: 'string' } as const

describe('state ⇄ saved query', () => {
  it('an empty state is empty and saves as an empty query', () => {
    expect(isEmptyQuery(emptyQueryState())).toBe(true)
    expect(toSavedQuery(emptyQueryState())).toEqual({})
  })

  it('saves only what is set and restores the same state', () => {
    const state: QueryState = { filterGroup: group, lucene: 'name:"Alice"', sort: ['-age'], projection: ['name'] }
    const saved = toSavedQuery(state)
    expect(saved).toEqual({ filterGroup: group, lucene: 'name:"Alice"', sort: ['-age'], projection: ['name'] })
    expect(fromSavedQuery(saved, types)).toEqual(state)
  })

  it('builds a restored group again, so the string matches the current field types', () => {
    const restored = fromSavedQuery({ filterGroup: group, lucene: 'stale' }, types)
    expect(restored.lucene).toBe('name:"Alice"')
  })

  it('keeps the string of a query saved without a group, and copies instead of sharing', () => {
    const restored = fromSavedQuery({ lucene: 'a:1', sort: ['x'] }, types)
    expect(restored).toEqual({ filterGroup: { match: 'all', conditions: [] }, lucene: 'a:1', sort: ['x'], projection: [] })
    const source = { filterGroup: group, sort: ['x'] }
    const copy = fromSavedQuery(source, types)
    copy.sort.push('y')
    copy.filterGroup.conditions[0]!.value = 'changed'
    expect(source.sort).toEqual(['x'])
    expect(group.conditions[0]!.value).toBe('Alice')
  })
})

describe('sort helpers', () => {
  it('parses and formats entries', () => {
    expect(parseSortEntry('-a')).toEqual({ field: 'a', desc: true })
    expect(parseSortEntry('a')).toEqual({ field: 'a', desc: false })
    expect(formatSortEntry('a', true)).toBe('-a')
  })

  it('adds, toggles, renames and removes, keeping a field unique and the count bounded', () => {
    expect(addSort([], 'a')).toEqual(['a'])
    expect(addSort(['a'], 'a')).toEqual(['a'])
    expect(addSort(Array.from({ length: MAX_SORT_ENTRIES }, (_, i) => `f${i}`), 'z')).toHaveLength(MAX_SORT_ENTRIES)
    expect(toggleSortDirection(['a', 'b'], 1)).toEqual(['a', '-b'])
    expect(toggleSortDirection(['a', '-b'], 1)).toEqual(['a', 'b'])
    expect(setSortField(['-a', 'b'], 0, 'c')).toEqual(['-c', 'b'])
    expect(setSortField(['a', 'b'], 0, 'b')).toEqual(['a', 'b'])
    expect(removeSort(['a', 'b'], 0)).toEqual(['b'])
  })
})

describe('projection helpers', () => {
  const all = ['a', 'b', 'c']

  it('an untick from "all" selects the rest, in field order', () => {
    expect(toggleProjectionField([], 'b', all)).toEqual(['a', 'c'])
  })

  it('ticking everything again goes back to empty (= all)', () => {
    expect(toggleProjectionField(['a', 'c'], 'b', all)).toEqual([])
  })

  it('never ends with no field', () => {
    expect(toggleProjectionField(['a'], 'a', all)).toEqual(['a'])
  })

  it('keeps only fields the collection has', () => {
    expect(usableProjection(['a', 'zzz'], all)).toEqual(['a'])
    expect(usableProjection(['a', 'b', 'c'], all)).toEqual([])
    expect(usableProjection(['zzz'], all)).toEqual([])
  })
})

describe('describeQuery', () => {
  const labels = { filter: 'Filter', sort: 'Sort', fields: 'Fields' }

  it('summarises filter, sort and fields', () => {
    expect(describeQuery({ lucene: 'a:1', sort: ['-x', 'y'], projection: ['a', 'b'] }, labels)).toBe('Filter: a:1 · Sort: x ↓, y ↑ · Fields: 2')
  })

  it('builds the filter of a saved group and shortens a long string', () => {
    expect(describeQuery({ filterGroup: group }, labels, types)).toBe('Filter: name:"Alice"')
    expect(describeQuery({ lucene: 'x'.repeat(100) }, labels)).toContain('…')
    expect(describeQuery({}, labels)).toBe('')
  })
})
