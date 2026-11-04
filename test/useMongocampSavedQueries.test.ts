import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { useMongocampSavedQueries } from '../src/runtime/composables/useMongocampSavedQueries'
import type { StorageLike } from '../src/runtime/utils/persistedState'

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: k => void data.delete(k) }
}

describe('useMongocampSavedQueries', () => {
  it('saves, lists, replaces and removes', async () => {
    const storage = memory()
    const q = useMongocampSavedQueries('orders', { storage })
    expect(q.save('Open', { lucene: 'status:open' })).toEqual({ ok: true })
    expect(q.save('open', { lucene: 'status:new' })).toEqual({ ok: true })
    expect(q.saved.value).toEqual([{ name: 'open', query: { lucene: 'status:new' } }])
    await nextTick()
    expect(useMongocampSavedQueries('orders', { storage }).saved.value).toHaveLength(1)
    q.remove('OPEN')
    expect(q.saved.value).toEqual([])
  })

  it('reports why a save failed', () => {
    const q = useMongocampSavedQueries('orders', { storage: memory() })
    expect(q.save('', { lucene: 'a' })).toEqual({ ok: false, reason: 'invalid-name' })
    expect(q.save('n', {})).toEqual({ ok: false, reason: 'invalid-query' })
  })

  it('records history, deduped and newest first, and ignores an empty query', () => {
    const q = useMongocampSavedQueries('orders', { storage: memory() })
    expect(q.record({})).toBe(false)
    q.record({ lucene: 'a' })
    q.record({ lucene: 'b' })
    q.record({ lucene: 'a' })
    expect(q.recent.value).toEqual([{ lucene: 'a' }, { lucene: 'b' }])
    q.clearRecent()
    expect(q.recent.value).toEqual([])
  })

  it('keeps collections apart and follows a changing collection', async () => {
    const storage = memory()
    const name = ref('orders')
    const q = useMongocampSavedQueries(name, { storage })
    q.save('A', { lucene: 'a' })
    await nextTick()
    name.value = 'users'
    await nextTick()
    expect(q.saved.value).toEqual([])
    name.value = 'orders'
    await nextTick()
    expect(q.saved.value).toHaveLength(1)
  })

  it('cleans a hand-edited store on read', () => {
    const storage = memory()
    storage.data.set('nuxt-ui-mongocamp:savedQueries:orders', JSON.stringify({ v: 1, data: { saved: [{ name: 'ok', query: { lucene: 'a' } }, { name: 'bad', query: { filterGroup: 1 } }, 'x'], recent: [{ lucene: 'a' }, 4] } }))
    const q = useMongocampSavedQueries('orders', { storage })
    expect(q.saved.value).toEqual([{ name: 'ok', query: { lucene: 'a' } }])
    expect(q.recent.value).toEqual([{ lucene: 'a' }])
  })

  it('exports and imports, merging into the existing list', () => {
    const a = useMongocampSavedQueries('orders', { storage: memory() })
    a.save('One', { lucene: 'a' })
    const b = useMongocampSavedQueries('orders', { storage: memory() })
    b.save('Two', { lucene: 'b' })
    expect(b.importJson(a.exportJson())).toEqual({ ok: true, imported: 1, skipped: 0 })
    expect(b.saved.value.map(e => e.name)).toEqual(['Two', 'One'])
    expect(b.importJson('{"x":1}')).toEqual({ ok: false, reason: 'foreign-format' })
    expect(b.saved.value).toHaveLength(2)
  })

  it('stops recording when the whole store would not fit, and changes nothing', () => {
    const q = useMongocampSavedQueries('orders', { storage: memory() })
    // 50 saved queries of ~2 KB each fill most of the 128 KB store, so the history runs out of room first
    for (let i = 0; i < 50; i++) expect(q.save(`n${i}`, { lucene: `${'x'.repeat(1990)}${i}` }).ok).toBe(true)
    let refused = false
    for (let i = 0; i < 20 && !refused; i++) refused = !q.record({ lucene: `${'y'.repeat(1990)}${i}` })
    expect(refused).toBe(true)
    expect(q.saved.value).toHaveLength(50)
    expect(q.save('one more', { lucene: 'a' })).toEqual({ ok: false, reason: 'limit' })
  })
})
