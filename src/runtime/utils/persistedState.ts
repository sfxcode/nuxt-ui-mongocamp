// Pure part of useMongocampPersistedState: a versioned `{ v, data }` envelope in a Storage-like object. Every access is
// guarded — private windows, blocked site data and a full quota all throw — so a failure only means "not remembered".

export interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export const PERSISTED_STATE_VERSION = 1
/** A value larger than this (serialised) is not stored; table state is tiny, so this only stops runaway data. */
export const PERSISTED_STATE_MAX_BYTES = 16_384
export const PERSISTED_STATE_PREFIX = 'nuxt-ui-mongocamp:'

export interface PersistOptions<T> {
  version?: number
  /** Turns data written by an older version into the current shape; return `undefined` to drop it. */
  migrate?: (data: unknown, fromVersion: number) => T | undefined
  /** Rejects data of the right version but a wrong shape (hand-edited, or written by another build). */
  validate?: (data: unknown) => data is T
  /** Largest serialised size that is stored (default 16 KB). */
  maxBytes?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The stored value, or `undefined` when there is none, it is corrupt, of an unknown version or fails `validate`. */
export function readPersisted<T>(storage: StorageLike | undefined, key: string, options: PersistOptions<T> = {}): T | undefined {
  if (!storage) return undefined
  const version = options.version ?? PERSISTED_STATE_VERSION
  try {
    const text = storage.getItem(key)
    if (!text) return undefined
    const envelope: unknown = JSON.parse(text)
    if (!isRecord(envelope) || typeof envelope.v !== 'number' || !('data' in envelope)) return undefined
    if (envelope.v === version) {
      return options.validate && !options.validate(envelope.data) ? undefined : envelope.data as T
    }
    if (envelope.v < version && options.migrate) return options.migrate(envelope.data, envelope.v)
    return undefined // written by a newer build, or nothing to migrate with
  }
  catch {
    return undefined
  }
}

/** Stores `data`; returns false when it was not stored (too large, storage unavailable or full). */
export function writePersisted(storage: StorageLike | undefined, key: string, data: unknown, version = PERSISTED_STATE_VERSION, maxBytes = PERSISTED_STATE_MAX_BYTES): boolean {
  if (!storage) return false
  try {
    const text = JSON.stringify({ v: version, data })
    if (text.length > maxBytes) return false
    storage.setItem(key, text)
    return true
  }
  catch {
    return false
  }
}

export function clearPersisted(storage: StorageLike | undefined, key: string): void {
  try {
    storage?.removeItem(key)
  }
  catch {
    // nothing to clear
  }
}

/** `localStorage` when this runs in a browser and it is reachable, else `undefined` (never throws). */
export function browserStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  }
  catch {
    return undefined
  }
}
