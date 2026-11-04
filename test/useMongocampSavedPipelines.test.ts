import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { useMongocampSavedPipelines } from '../src/runtime/composables/useMongocampSavedPipelines'
import type { StorageLike } from '../src/runtime/utils/persistedState'

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: k => void data.delete(k) }
}

const good = [{ stage: '$group', value: { _id: '$a', n: { $sum: 1 } } }]

describe('useMongocampSavedPipelines', () => {
  it('saves, lists, replaces and removes, and remembers across instances', async () => {
    const storage = memory()
    const p = useMongocampSavedPipelines('orders', { storage })
    expect(p.save('Count', good)).toEqual({ ok: true })
    expect(p.save('count', [{ stage: '$limit', value: 3 }])).toEqual({ ok: true })
    expect(p.saved.value).toEqual([{ name: 'count', pipeline: [{ stage: '$limit', value: 3 }] }])
    await nextTick()
    expect(useMongocampSavedPipelines('orders', { storage }).saved.value).toHaveLength(1)
    p.remove('COUNT')
    expect(p.saved.value).toEqual([])
  })

  it('says why a save failed', () => {
    const p = useMongocampSavedPipelines('orders', { storage: memory() })
    expect(p.save('', good)).toEqual({ ok: false, reason: 'invalid-name' })
    expect(p.save('x', [])).toEqual({ ok: false, reason: 'invalid-pipeline' })
    expect(p.save('x', [{ stage: '$out', value: 'y' }])).toEqual({ ok: false, reason: 'invalid-pipeline' })
  })

  it('keeps collections apart and follows a changing collection', async () => {
    const storage = memory()
    const name = ref('orders')
    const p = useMongocampSavedPipelines(name, { storage })
    p.save('A', good)
    await nextTick()
    name.value = 'users'
    await nextTick()
    expect(p.saved.value).toEqual([])
    name.value = 'orders'
    await nextTick()
    expect(p.saved.value).toHaveLength(1)
  })

  it('drops a denied operator from a hand-edited store when reading', () => {
    const storage = memory()
    storage.data.set('nuxt-ui-mongocamp:savedPipelines:orders', JSON.stringify({ v: 1, data: { pipelines: [
      { name: 'ok', pipeline: good },
      { name: 'evil', pipeline: [{ stage: '$out', value: 'stolen' }] },
      { name: 'sneaky', pipeline: [{ stage: '$addFields', value: { x: { $function: { body: 'x', args: [], lang: 'js' } } } }] },
    ] } }))
    expect(useMongocampSavedPipelines('orders', { storage }).saved.value.map(e => e.name)).toEqual(['ok'])
  })
})
