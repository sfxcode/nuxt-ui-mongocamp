import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { useMongocampPersistedState } from '../src/runtime/composables/useMongocampPersistedState'
import type { StorageLike } from '../src/runtime/utils/persistedState'

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: k => void data.delete(k) }
}

describe('useMongocampPersistedState', () => {
  it('starts from the defaults, stores changes and restores them', async () => {
    const storage = memory()
    const a = useMongocampPersistedState('t', { size: 20, hidden: [] as string[] }, { storage })
    expect(a.state.value).toEqual({ size: 20, hidden: [] })
    a.state.value.size = 50
    await nextTick()
    expect(storage.data.has('nuxt-ui-mongocamp:t')).toBe(true)

    expect(useMongocampPersistedState('t', { size: 20, hidden: [] as string[] }, { storage }).state.value.size).toBe(50)
  })

  it('merges stored values over the defaults, so a new field gets its default', () => {
    const storage = memory()
    storage.data.set('nuxt-ui-mongocamp:t', JSON.stringify({ v: 1, data: { size: 5 } }))
    expect(useMongocampPersistedState('t', { size: 20, extra: 'x' }, { storage }).state.value).toEqual({ size: 5, extra: 'x' })
  })

  it('loads the entry of the new key when a getter key changes', async () => {
    const storage = memory()
    storage.data.set('nuxt-ui-mongocamp:b', JSON.stringify({ v: 1, data: { size: 100 } }))
    const key = ref('a')
    const { state } = useMongocampPersistedState(key, { size: 20 }, { storage })
    state.value.size = 50
    await nextTick()
    key.value = 'b'
    await nextTick()
    expect(state.value.size).toBe(100)
    expect(JSON.parse(storage.data.get('nuxt-ui-mongocamp:a')!).data.size).toBe(50)
  })

  it('reset clears the entry and restores the defaults', async () => {
    const storage = memory()
    const { state, reset } = useMongocampPersistedState('t', { size: 20 }, { storage })
    state.value.size = 50
    await nextTick()
    reset()
    expect(state.value.size).toBe(20)
  })

  it('works with storage off (null) and a throwing storage', async () => {
    const off = useMongocampPersistedState('t', { size: 20 }, { storage: null })
    off.state.value.size = 1
    await nextTick()
    const fail = () => {
      throw new Error('x')
    }
    const bad: StorageLike = { getItem: fail, setItem: fail, removeItem: fail }
    const s = useMongocampPersistedState('t', { size: 20 }, { storage: bad })
    s.state.value.size = 2
    await nextTick()
    expect(s.state.value.size).toBe(2)
  })
})
