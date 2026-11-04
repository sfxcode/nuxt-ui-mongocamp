// Typed numbers from the two places the server shows storage and index usage: `getCollectionInformation`
// (`CollectionStatus`) and the `$indexStats` aggregation stage. Pure mapping — the server's own `ns` (database name),
// `host` (database address) and the index `spec` are deliberately not carried over.
import type { CollectionStatus } from '@sfxcode/nuxt-mongocamp-server'

export interface CollectionStorage {
  collectionType: string
  /** Number of documents. */
  count: number
  /** Uncompressed size of the documents, in bytes. */
  size: number
  /** Size on disk (compressed), in bytes. */
  storageSize: number
  avgObjSize: number
  indexCount: number
  /** Bytes per index name. */
  indexSizes: Record<string, number>
  totalIndexSize: number
}

export interface IndexUsage {
  name: string
  /** The indexed fields, e.g. `{ name: 1 }`. */
  key: Record<string, unknown>
  /** Operations that used the index since `since` (counted per server start). */
  ops: number
  /** ISO time the counter started; `null` when the server did not say. */
  since: string | null
  /** No operation has used it since `since` — a candidate to drop (never the `_id_` index). */
  unused: boolean
}

/** A non-negative finite number, else 0 (a missing or malformed number is not worth failing a card for). */
export function toCount(value: unknown): number {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0
}

export function mapStorage(status: Partial<CollectionStatus>): CollectionStorage {
  const indexSizes: Record<string, number> = {}
  for (const [name, size] of Object.entries(status.indexSizes ?? {})) indexSizes[name] = toCount(size)
  return {
    collectionType: typeof status.collectionType === 'string' ? status.collectionType : '',
    count: toCount(status.count),
    size: toCount(status.size),
    storageSize: toCount(status.storageSize),
    avgObjSize: toCount(status.avgObjSize),
    indexCount: toCount(status.nindexes),
    indexSizes,
    totalIndexSize: toCount(status.totalIndexSize),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isoOrNull(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value
  return null
}

/** Rows of a `$indexStats` aggregation (already unwrapped, `host`/`ns` stripped) as typed usage; rows without a name are skipped. */
export function mapIndexUsage(rows: Array<Record<string, unknown>>): IndexUsage[] {
  const out: IndexUsage[] = []
  for (const row of rows) {
    if (typeof row.name !== 'string' || row.name === '') continue
    const accesses = isRecord(row.accesses) ? row.accesses : {}
    const ops = toCount(accesses.ops)
    out.push({
      name: row.name,
      key: isRecord(row.key) ? row.key : {},
      ops,
      since: isoOrNull(accesses.since),
      unused: ops === 0,
    })
  }
  return out
}
