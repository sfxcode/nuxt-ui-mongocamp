import { isObjectIdHex } from './objectId'

// `updateMany` reported fewer matches than documents asked for: some were deleted meanwhile, and
// the response cannot say which ones.
export class BulkMatchShortfall extends Error {
  constructor(public matched: number, public expected: number) {
    super(`Only ${matched} of ${expected} documents were found`)
    this.name = 'BulkMatchShortfall'
  }
}

// An `_id` that is not an ObjectId hex string cannot be updated at all: neither a filter nor the
// single-document endpoint accepts it (the server answers 500 "hexString has 24 characters")
export class BulkUnaddressableId extends Error {
  constructor(public id: string) {
    super(`Document id "${id}" cannot be used in a bulk filter`)
    this.name = 'BulkUnaddressableId'
  }
}

export interface BulkUpdateFailure {
  ids: string[]
  error: unknown
}

export interface BulkUpdateResult {
  updated: string[]
  failed: BulkUpdateFailure[]
}

export interface BulkUpdateOptions {
  chunkSize?: number
}

const DEFAULT_CHUNK_SIZE = 100

// Fields a bulk edit may write: top-level, not the id, no operator-looking or dotted names.
export function isEditableField(field: string): boolean {
  return field !== '' && field !== '_id' && !field.startsWith('$') && !field.includes('.')
}

// `{ _id: { $in } }` fails on this server, an `$or` of plain hex ids works. Refuses an empty list:
// an empty filter would match every document in the collection.
export function buildIdFilter(ids: string[]): { $or: { _id: string }[] } {
  if (ids.length === 0) throw new Error('buildIdFilter needs at least one id')
  const bad = ids.find(id => !isObjectIdHex(id))
  if (bad !== undefined) throw new BulkUnaddressableId(bad)
  return { $or: ids.map(id => ({ _id: id })) }
}

// Updates the documents with `updateMany` in chunks of ids (one request per chunk, in order) and
// reports what could not be updated instead of stopping: a half-finished edit must say which
// documents were left alone. Never calls anything for an empty list. Ids that are not ObjectId hex
// strings are reported as failures without a request.
export async function runBulkUpdate(
  ids: string[],
  updateMany: (ids: string[]) => Promise<unknown>,
  options: BulkUpdateOptions = {},
): Promise<BulkUpdateResult> {
  const chunkSize = Math.max(1, Math.floor(options.chunkSize ?? DEFAULT_CHUNK_SIZE) || DEFAULT_CHUNK_SIZE)
  const result: BulkUpdateResult = { updated: [], failed: [] }
  const addressable = ids.filter(id => isObjectIdHex(id))
  const others = ids.filter(id => !isObjectIdHex(id))

  for (let start = 0; start < addressable.length; start += chunkSize) {
    const chunk = addressable.slice(start, start + chunkSize)
    try {
      const response = await updateMany(chunk)
      const matched = (response as { matchedCount?: unknown } | null)?.matchedCount
      if (typeof matched === 'number' && matched < chunk.length) result.failed.push({ ids: chunk, error: new BulkMatchShortfall(matched, chunk.length) })
      else result.updated.push(...chunk)
    }
    catch (error) {
      result.failed.push({ ids: chunk, error })
    }
  }

  // reported without a request: the server would only answer 500
  for (const id of others) result.failed.push({ ids: [id], error: new BulkUnaddressableId(id) })
  return result
}
