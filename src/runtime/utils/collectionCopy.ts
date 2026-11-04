// Rules for copying a collection into a new one. Pure.
import { isProtectedCollection } from './collectionProtection'

/** More documents than this are not copied through the browser (everything is held in memory while copying). */
export const MAX_COPY_DOCUMENTS = 50_000
export const MAX_COLLECTION_NAME_LENGTH = 100

// Letters, digits, `_`, `-` and `.` (not first). Narrower than MongoDB allows on purpose: the name goes into a URL path and
// into grants, where anything else only causes surprises.
const ALLOWED_NAME = /^\w[\w.-]*$/

export type TargetNameProblem = 'empty' | 'too-long' | 'invalid-characters' | 'protected' | 'same-as-source' | 'exists'

/**
 * What is wrong with a name for the new collection, or `undefined` when it is fine. `existing` is every collection the
 * server lists; a name equal to one of them ignoring case counts as existing (grants match case-insensitively, so two
 * names that differ only in case would be confusing even though MongoDB keeps them apart).
 */
export function validateTargetName(name: string, source: string, existing: readonly string[]): TargetNameProblem | undefined {
  const target = name.trim()
  if (target === '') return 'empty'
  if (target.length > MAX_COLLECTION_NAME_LENGTH) return 'too-long'
  if (!ALLOWED_NAME.test(target)) return 'invalid-characters'
  // `mc_*` is MongoCamp's own, `<x>.files` / `<x>.chunks` are GridFS halves and `system.*` is MongoDB's
  if (isProtectedCollection(target) || target.startsWith('system.')) return 'protected'
  if (target.toLowerCase() === source.toLowerCase()) return 'same-as-source'
  if (existing.some(e => e.toLowerCase() === target.toLowerCase())) return 'exists'
  return undefined
}

/** A collection that may be copied: not MongoCamp's own, not a GridFS half (those need their other half). */
export function canCopyCollection(name: string): boolean {
  return !isProtectedCollection(name) && !name.startsWith('system.')
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** `20261104_153045` — local date and time, sortable, safe in a collection name. */
export function backupStamp(now: Date): string {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

/**
 * The name of a quick backup of `source`: `<source>_backup_<yyyymmdd>_<hhmmss>`. Characters a new name may not contain are
 * replaced by `_`, the source part is shortened to stay within the length limit, and when the name already exists (two
 * backups in the same second, or one made earlier) `_2`, `_3`, … is appended. The result always passes `validateTargetName`
 * for an ordinary source; for a source that cannot be copied (`canCopyCollection`) there is no backup name.
 */
export function backupName(source: string, existing: readonly string[], now: Date = new Date()): string {
  const taken = new Set(existing.map(e => e.toLowerCase()))
  const cleaned = source.replace(/[^\w.-]/g, '_').replace(/^[.-]+/, '') || 'collection'
  const stamp = backupStamp(now)
  for (let attempt = 1; ; attempt++) {
    const suffix = `_backup_${stamp}${attempt > 1 ? `_${attempt}` : ''}`
    const name = `${cleaned.slice(0, MAX_COLLECTION_NAME_LENGTH - suffix.length)}${suffix}`
    if (!taken.has(name.toLowerCase())) return name
  }
}

/** Thrown for a source that cannot be copied at all (MongoCamp's own collections, GridFS halves, `system.*`). */
export class CollectionNotCopyableError extends Error {
  constructor(public collection: string) {
    super(`Collection "${collection}" cannot be copied`)
    this.name = 'CollectionNotCopyableError'
  }
}
