// Numbers behind MongocampServerOverview: which collections weigh most, totals, the share of storage and the next jobs. Pure.
import type { DatabaseInfo, JobInformation } from '@sfxcode/nuxt-mongocamp-server'

export interface CollectionStat {
  name: string
  count: number
  /** Uncompressed size of the documents, bytes. */
  size: number
  /** Size on disk, bytes. */
  storageSize: number
  avgObjSize: number
  indexCount: number
  totalIndexSize: number
}

export type RankBy = 'storageSize' | 'count' | 'avgObjSize' | 'totalIndexSize'
export const RANK_METRICS: readonly RankBy[] = ['storageSize', 'count', 'avgObjSize', 'totalIndexSize']
/** Metrics that are byte sizes (the others are plain counts). */
export const BYTE_METRICS: ReadonlySet<RankBy> = new Set<RankBy>(['storageSize', 'avgObjSize', 'totalIndexSize'])

/** The `n` collections with the highest value of `by`, highest first (ties by name); collections with nothing in them are left out. */
export function rankCollections(stats: readonly CollectionStat[], by: RankBy, n: number): CollectionStat[] {
  return stats
    .filter(s => s[by] > 0)
    .sort((a, b) => b[by] - a[by] || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, Math.floor(n)))
}

export interface OverviewTotals {
  databases: number
  /** Sum of the databases' size on disk, bytes (0 when they could not be read). */
  diskBytes: number
  collections: number
  documents: number
  /** Sum of the collections' size on disk, bytes. */
  storageBytes: number
  indexBytes: number
  indexes: number
}

export function overviewTotals(stats: readonly CollectionStat[], databases: readonly DatabaseInfo[] | null): OverviewTotals {
  const sum = (pick: (s: CollectionStat) => number) => stats.reduce((total, s) => total + pick(s), 0)
  return {
    databases: databases?.length ?? 0,
    diskBytes: databases?.reduce((total, d) => total + (Number.isFinite(d.sizeOnDisk) ? d.sizeOnDisk : 0), 0) ?? 0,
    collections: stats.length,
    documents: sum(s => s.count),
    storageBytes: sum(s => s.storageSize),
    indexBytes: sum(s => s.totalIndexSize),
    indexes: sum(s => s.indexCount),
  }
}

export interface ShareSlice {
  /** The collection name, or `null` for the slice that sums up all the others. */
  name: string | null
  value: number
}

/** The `top` biggest collections by `by` and one slice for everything else (a donut stays readable with 6 slices). */
export function shareSlices(stats: readonly CollectionStat[], by: RankBy, top = 5): ShareSlice[] {
  const ranked = rankCollections(stats, by, stats.length)
  const slices: ShareSlice[] = ranked.slice(0, top).map(s => ({ name: s.name, value: s[by] }))
  const rest = ranked.slice(top).reduce((total, s) => total + s[by], 0)
  if (rest > 0) slices.push({ name: null, value: rest })
  return slices
}

function toDate(value: unknown): Date | undefined {
  const date = value instanceof Date ? value : typeof value === 'string' || typeof value === 'number' ? new Date(value) : undefined
  return date && !Number.isNaN(date.getTime()) ? date : undefined
}

export interface UpcomingJob {
  group: string
  name: string
  cronExpression: string
  next: Date
}

/** The next `n` scheduled runs, soonest first; a job without a (valid) next fire time is not scheduled and is left out. */
export function nextJobs(jobs: readonly JobInformation[], n: number): UpcomingJob[] {
  const upcoming: UpcomingJob[] = []
  for (const job of jobs) {
    const next = toDate(job.nextScheduledFireTime)
    if (next) upcoming.push({ group: job.group, name: job.name, cronExpression: job.cronExpression, next })
  }
  return upcoming.sort((a, b) => a.next.getTime() - b.next.getTime() || `${a.group}/${a.name}`.localeCompare(`${b.group}/${b.name}`)).slice(0, Math.max(0, Math.floor(n)))
}

/** A collection's statistics from the server's collection information; missing or malformed numbers count as 0. */
export function toCollectionStat(name: string, info: Partial<Record<'count' | 'size' | 'storageSize' | 'avgObjSize' | 'nindexes' | 'totalIndexSize', unknown>>): CollectionStat {
  const n = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0)
  return { name, count: n(info.count), size: n(info.size), storageSize: n(info.storageSize), avgObjSize: n(info.avgObjSize), indexCount: n(info.nindexes), totalIndexSize: n(info.totalIndexSize) }
}
