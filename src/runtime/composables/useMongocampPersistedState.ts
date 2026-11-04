import { ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { browserStorage, clearPersisted, PERSISTED_STATE_PREFIX, readPersisted, writePersisted } from '../utils/persistedState'
import type { PersistOptions, StorageLike } from '../utils/persistedState'

export interface PersistedStateOptions<T> extends PersistOptions<T> {
  /** Defaults to `localStorage` in the browser; `null` turns it off; nothing is stored on the server or when it is unreachable. */
  storage?: StorageLike | null
}

/**
 * A ref whose value is remembered in `localStorage` under `nuxt-ui-mongocamp:<key>` (a versioned `{ v, data }` envelope).
 * `key` may be a getter: when it changes the stored value for the new key is loaded (or the defaults). Stored values are
 * merged over the defaults, so a field added later gets its default. Anything unreadable falls back to the defaults.
 */
export function useMongocampPersistedState<T extends Record<string, unknown>>(
  key: MaybeRefOrGetter<string>,
  defaults: T,
  options: PersistedStateOptions<T> = {},
): { state: Ref<T>, reset: () => void } {
  const storage = options.storage === null ? undefined : (options.storage ?? (import.meta.client ? browserStorage() : undefined))
  const fullKey = () => PERSISTED_STATE_PREFIX + toValue(key)
  const load = (): T => ({ ...defaults, ...readPersisted<T>(storage, fullKey(), options) })

  const state = ref(load()) as Ref<T>
  let loadedKey = fullKey()

  watch(() => fullKey(), (next) => {
    loadedKey = next
    state.value = load()
  })
  watch(state, (value) => {
    writePersisted(storage, loadedKey, value, options.version, options.maxBytes)
  }, { deep: true })

  function reset() {
    clearPersisted(storage, loadedKey)
    state.value = { ...defaults }
  }

  return { state, reset }
}
