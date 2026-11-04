import { describe, expect, it } from 'vitest'
import type { DatabaseInfo, JobInformation } from '@sfxcode/nuxt-mongocamp-server'
import { nextJobs, overviewTotals, rankCollections, shareSlices, toCollectionStat } from '../src/runtime/utils/serverOverview'
import type { CollectionStat } from '../src/runtime/utils/serverOverview'

const stat = (name: string, patch: Partial<CollectionStat> = {}): CollectionStat => ({ name, count: 0, size: 0, storageSize: 0, avgObjSize: 0, indexCount: 1, totalIndexSize: 0, ...patch })
const stats = [
  stat('a', { count: 10, storageSize: 4000, avgObjSize: 400, totalIndexSize: 100 }),
  stat('b', { count: 1000, storageSize: 9000, avgObjSize: 9, totalIndexSize: 5000 }),
  stat('c', { count: 500, storageSize: 9000, avgObjSize: 18, totalIndexSize: 200 }),
  stat('empty'),
]

describe('rankCollections', () => {
  it('orders by the metric, highest first, ties by name, and drops empty ones', () => {
    expect(rankCollections(stats, 'storageSize', 10).map(s => s.name)).toEqual(['b', 'c', 'a'])
    expect(rankCollections(stats, 'count', 10).map(s => s.name)).toEqual(['b', 'c', 'a'])
    expect(rankCollections(stats, 'avgObjSize', 10).map(s => s.name)).toEqual(['a', 'c', 'b'])
    expect(rankCollections(stats, 'totalIndexSize', 2).map(s => s.name)).toEqual(['b', 'c'])
  })

  it('does not change its input and copes with silly n', () => {
    const copy = [...stats]
    rankCollections(stats, 'count', 2)
    expect(stats).toEqual(copy)
    expect(rankCollections(stats, 'count', 0)).toEqual([])
    expect(rankCollections(stats, 'count', -3)).toEqual([])
  })
})

describe('overviewTotals', () => {
  it('adds up the collections and the databases', () => {
    const databases = [{ name: 'x', sizeOnDisk: 1000 }, { name: 'y', sizeOnDisk: 2500 }] as DatabaseInfo[]
    expect(overviewTotals(stats, databases)).toEqual({ databases: 2, diskBytes: 3500, collections: 4, documents: 1510, storageBytes: 22000, indexBytes: 5300, indexes: 4 })
  })

  it('is zero without databases and for no collections', () => {
    expect(overviewTotals([], null)).toEqual({ databases: 0, diskBytes: 0, collections: 0, documents: 0, storageBytes: 0, indexBytes: 0, indexes: 0 })
  })
})

describe('shareSlices', () => {
  it('keeps the top slices and sums up the rest as one unnamed slice', () => {
    const many = Array.from({ length: 8 }, (_, i) => stat(`c${i}`, { storageSize: (8 - i) * 100 }))
    const slices = shareSlices(many, 'storageSize', 5)
    expect(slices).toHaveLength(6)
    expect(slices.slice(0, 5).map(s => s.name)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4'])
    expect(slices[5]).toEqual({ name: null, value: 300 + 200 + 100 })
  })

  it('has no "other" slice when everything fits, and none for empty collections', () => {
    expect(shareSlices(stats, 'storageSize', 5).every(s => s.name !== null)).toBe(true)
    expect(shareSlices(stats, 'storageSize', 5).map(s => s.name)).toEqual(['b', 'c', 'a'])
    expect(shareSlices([], 'count')).toEqual([])
  })
})

describe('nextJobs', () => {
  const job = (name: string, next: unknown): JobInformation => ({ name, group: 'g', jobClassName: 'x', cronExpression: '* * * * * ?', priority: 5, nextScheduledFireTime: next as Date })

  it('lists the soonest runs first and leaves out jobs that are not scheduled', () => {
    const jobs = [job('late', new Date('2026-11-05T10:00:00Z')), job('none', undefined), job('soon', '2026-11-04T10:00:00Z'), job('bad', 'not a date'), job('mid', new Date('2026-11-04T12:00:00Z'))]
    expect(nextJobs(jobs, 5).map(j => j.name)).toEqual(['soon', 'mid', 'late'])
    expect(nextJobs(jobs, 2).map(j => j.name)).toEqual(['soon', 'mid'])
    expect(nextJobs(jobs, 1)[0]!.next).toBeInstanceOf(Date)
  })
})

describe('toCollectionStat', () => {
  it('maps the collection information and turns bad numbers into 0', () => {
    expect(toCollectionStat('a', { count: 5, size: 10, storageSize: 4096, avgObjSize: 2, nindexes: 3, totalIndexSize: 8192 })).toEqual({ name: 'a', count: 5, size: 10, storageSize: 4096, avgObjSize: 2, indexCount: 3, totalIndexSize: 8192 })
    expect(toCollectionStat('b', { count: 'x', size: -1, storageSize: Number.NaN })).toEqual({ name: 'b', count: 0, size: 0, storageSize: 0, avgObjSize: 0, indexCount: 0, totalIndexSize: 0 })
  })
})
