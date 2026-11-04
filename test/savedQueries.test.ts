import { describe, expect, it } from 'vitest'
import {
  MAX_LUCENE_LENGTH, MAX_RECENT, MAX_SAVED, MAX_STORE_BYTES, parseSavedImport, pushRecent, queryKey,
  sanitizeQuery, sanitizeRecentList, sanitizeSavedList, serializeSaved, upsertSaved,
} from '../src/runtime/utils/savedQueries'
import { buildFilterQuery } from '../src/runtime/utils/filterBuilder'
import type { SavedQuery, SavedQueryEntry } from '../src/runtime/utils/savedQueries'

const group = { match: 'all' as const, conditions: [{ id: 'c1', field: 'name', operator: 'equals' as const, value: 'Alice' }] }

describe('sanitizeQuery', () => {
  it('keeps the known fields and drops the rest', () => {
    expect(sanitizeQuery({ lucene: 'a:1', sort: ['-a'], projection: ['a'], filterGroup: group, evil: 1 })).toEqual({ lucene: 'a:1', sort: ['-a'], projection: ['a'], filterGroup: group })
  })

  it('returns undefined for an empty or non-object query', () => {
    for (const v of [undefined, null, 'x', [], {}, { lucene: '  ' }, { sort: [] }, { filterGroup: { match: 'all', conditions: [] } }]) {
      expect(sanitizeQuery(v)).toBeUndefined()
    }
  })

  it('drops a filter group with any invalid condition, whole', () => {
    const bad = { match: 'all', conditions: [group.conditions[0], { id: 'c2', field: 'x', operator: '$where' }] }
    expect(sanitizeQuery({ lucene: 'a:1', filterGroup: bad })).toEqual({ lucene: 'a:1' })
    expect(sanitizeQuery({ filterGroup: { match: 'some', conditions: group.conditions } })).toBeUndefined()
  })

  it('bounds sizes', () => {
    expect(sanitizeQuery({ lucene: 'x'.repeat(MAX_LUCENE_LENGTH + 1) })).toBeUndefined()
    expect(sanitizeQuery({ sort: Array.from({ length: 30 }, (_, i) => `f${i}`) })!.sort).toHaveLength(10)
    expect(sanitizeQuery({ filterGroup: { match: 'all', conditions: Array.from({ length: 51 }, (_, i) => ({ ...group.conditions[0], id: `c${i}` })) } })).toBeUndefined()
    expect(sanitizeQuery({ filterGroup: { match: 'all', conditions: [{ ...group.conditions[0], value: 'v'.repeat(501) }] } })).toBeUndefined()
  })

  it('keeps negate only when true', () => {
    expect(sanitizeQuery({ filterGroup: { ...group, negate: true } })!.filterGroup!.negate).toBe(true)
    expect('negate' in sanitizeQuery({ filterGroup: { ...group, negate: false } })!.filterGroup!).toBe(false)
  })
})

describe('queryKey', () => {
  it('ignores key order and condition ids', () => {
    const a: SavedQuery = { lucene: 'a:1', sort: ['x'], filterGroup: group }
    const b: SavedQuery = { filterGroup: { conditions: [{ operator: 'equals', value: 'Alice', field: 'name', id: 'other' }], match: 'all' }, sort: ['x'], lucene: 'a:1' }
    expect(queryKey(a)).toBe(queryKey(b))
    expect(queryKey(a)).not.toBe(queryKey({ ...a, lucene: 'a:2' }))
  })
})

describe('pushRecent', () => {
  it('moves an equal query to the front and caps the list', () => {
    let list: SavedQuery[] = []
    for (let i = 0; i < MAX_RECENT + 5; i++) list = pushRecent(list, { lucene: `a:${i}` })
    expect(list).toHaveLength(MAX_RECENT)
    expect(list[0]).toEqual({ lucene: `a:${MAX_RECENT + 4}` })
    list = pushRecent(list, { lucene: 'a:10' })
    expect(list[0]).toEqual({ lucene: 'a:10' })
    expect(list.filter(q => q.lucene === 'a:10')).toHaveLength(1)
  })
})

describe('upsertSaved', () => {
  it('adds, replaces by name case-insensitively and trims', () => {
    const a = upsertSaved([], '  Open  ', { lucene: 'a:1' })
    expect(a.ok && a.list).toEqual([{ name: 'Open', query: { lucene: 'a:1' } }])
    const b = upsertSaved(a.ok ? a.list : [], 'open', { lucene: 'a:2' })
    expect(b.ok && b.list).toEqual([{ name: 'open', query: { lucene: 'a:2' } }])
  })

  it('refuses a bad name, an empty query and a full list (but still replaces when full)', () => {
    expect(upsertSaved([], '  ', { lucene: 'a' })).toEqual({ ok: false, reason: 'invalid-name' })
    expect(upsertSaved([], 'x'.repeat(81), { lucene: 'a' })).toEqual({ ok: false, reason: 'invalid-name' })
    expect(upsertSaved([], 'n', {})).toEqual({ ok: false, reason: 'invalid-query' })
    const full: SavedQueryEntry[] = Array.from({ length: MAX_SAVED }, (_, i) => ({ name: `n${i}`, query: { lucene: 'a' } }))
    expect(upsertSaved(full, 'new', { lucene: 'a' })).toEqual({ ok: false, reason: 'limit' })
    expect(upsertSaved(full, 'N0', { lucene: 'b' }).ok).toBe(true)
  })
})

describe('sanitize lists', () => {
  it('drops bad entries and duplicates', () => {
    expect(sanitizeSavedList([{ name: 'a', query: { lucene: 'x' } }, { name: 'A', query: { lucene: 'y' } }, { name: '', query: {} }, 5])).toEqual([{ name: 'A', query: { lucene: 'y' } }])
    expect(sanitizeRecentList([{ lucene: 'x' }, { lucene: 'x' }, {}, 'z'])).toEqual([{ lucene: 'x' }])
    expect(sanitizeSavedList('nope')).toEqual([])
  })
})

describe('import', () => {
  const list: SavedQueryEntry[] = [{ name: 'Open', query: { lucene: 'status:open' } }]

  it('round-trips through the export format', () => {
    expect(parseSavedImport(serializeSaved(list), [])).toEqual({ ok: true, list, imported: 1, skipped: 0 })
  })

  it('merges, replaces same names and counts skipped entries', () => {
    const text = JSON.stringify({ format: 'nuxt-ui-mongocamp-saved-queries', version: 1, queries: [{ name: 'open', query: { lucene: 'z:1' } }, { name: 'bad' }, 7, { name: 'New', query: { sort: ['a'] } }] })
    const r = parseSavedImport(text, list)
    expect(r).toMatchObject({ ok: true, imported: 2, skipped: 2 })
    expect(r.ok && r.list.map(e => e.name)).toEqual(['open', 'New'])
  })

  it('refuses foreign, non-JSON and oversized input whole', () => {
    expect(parseSavedImport('{oops', [])).toEqual({ ok: false, reason: 'not-json' })
    expect(parseSavedImport(JSON.stringify({ queries: [] }), [])).toEqual({ ok: false, reason: 'foreign-format' })
    expect(parseSavedImport(JSON.stringify({ format: 'nuxt-ui-mongocamp-saved-queries', version: 2, queries: [] }), [])).toEqual({ ok: false, reason: 'foreign-format' })
    expect(parseSavedImport('[]', [])).toEqual({ ok: false, reason: 'foreign-format' })
    expect(parseSavedImport(' '.repeat(MAX_STORE_BYTES + 1), [])).toEqual({ ok: false, reason: 'too-large' })
  })
})

describe('a restored filter group', () => {
  it('builds the same Lucene string as the original', () => {
    const original = { match: 'any' as const, negate: true, conditions: [
      { id: 'a', field: 'name', operator: 'contains' as const, value: 'Al' },
      { id: 'b', field: 'age', operator: 'between' as const, value: '18', value2: '65' },
    ] }
    const types = { name: 'string', age: 'number' } as const
    const restored = sanitizeQuery(JSON.parse(JSON.stringify({ filterGroup: original })))!.filterGroup!
    expect(buildFilterQuery(restored, types)).toBe(buildFilterQuery(original, types))
    expect(buildFilterQuery(restored, types)).not.toBe('')
  })
})
