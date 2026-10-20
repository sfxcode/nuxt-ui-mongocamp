import { describe, it, expect, vi } from 'vitest'
import { BulkMatchShortfall, BulkUnaddressableId, buildIdFilter, isEditableField, runBulkUpdate } from '../src/runtime/utils/bulkEdit'
import { isObjectIdHex } from '../src/runtime/utils/objectId'

const hex = (n: number) => n.toString(16).padStart(24, '0')
const ids = (n: number) => Array.from({ length: n }, (_, i) => hex(i + 1))

describe('isObjectIdHex', () => {
  it('accepts exactly 24 hex characters', () => {
    expect(isObjectIdHex('6ad7cc585b8b911e12c58cc5')).toBe(true)
    expect(isObjectIdHex('6AD7CC585B8B911E12C58CC5')).toBe(true)
    for (const bad of ['doc-1', '', '6ad7cc585b8b911e12c58cc', '6ad7cc585b8b911e12c58cc55', 5, null, { $oid: 'x' }]) expect(isObjectIdHex(bad)).toBe(false)
  })
})

describe('isEditableField', () => {
  it('refuses the id, empty, operator-like and dotted names', () => {
    expect(isEditableField('name')).toBe(true)
    for (const bad of ['', '_id', '$set', 'a.b']) expect(isEditableField(bad)).toBe(false)
  })
})

describe('buildIdFilter', () => {
  it('builds an $or of plain hex ids (an $in on _id fails on the server)', () => {
    expect(buildIdFilter([hex(1), hex(2)])).toEqual({ $or: [{ _id: hex(1) }, { _id: hex(2) }] })
  })

  it('refuses an empty list — an empty filter would match every document', () => {
    expect(() => buildIdFilter([])).toThrow()
  })

  it('refuses an id the server could not use', () => {
    expect(() => buildIdFilter([hex(1), 'doc-1'])).toThrow(BulkUnaddressableId)
  })
})

describe('runBulkUpdate', () => {
  it('sends the ids in chunks, in order, one request per chunk', async () => {
    const updateMany = vi.fn().mockImplementation(async (chunk: string[]) => ({ matchedCount: chunk.length }))
    const all = ids(250)
    const result = await runBulkUpdate(all, updateMany)

    expect(updateMany.mock.calls.map(c => c[0].length)).toEqual([100, 100, 50])
    expect(updateMany.mock.calls.flatMap(c => c[0])).toEqual(all)
    expect(result).toEqual({ updated: all, failed: [] })
  })

  it('handles chunk boundaries: exact multiple, one more, one fewer', async () => {
    for (const [n, calls] of [[100, 1], [101, 2], [99, 1], [1, 1]] as const) {
      const updateMany = vi.fn().mockImplementation(async (chunk: string[]) => ({ matchedCount: chunk.length }))
      await runBulkUpdate(ids(n), updateMany)
      expect(updateMany).toHaveBeenCalledTimes(calls)
    }
  })

  it('does nothing for an empty list', async () => {
    const updateMany = vi.fn()
    expect(await runBulkUpdate([], updateMany)).toEqual({ updated: [], failed: [] })
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('reports a failed chunk with its ids and carries on with the next one', async () => {
    const boom = new Error('boom')
    const updateMany = vi.fn()
      .mockRejectedValueOnce(boom)
      .mockResolvedValueOnce({ matchedCount: 2 })
    const result = await runBulkUpdate(ids(4), updateMany, { chunkSize: 2 })

    expect(result.updated).toEqual(ids(4).slice(2))
    expect(result.failed).toEqual([{ ids: ids(4).slice(0, 2), error: boom }])
  })

  it('treats fewer matches than ids as a failure of that chunk, never as success', async () => {
    const updateMany = vi.fn().mockResolvedValue({ matchedCount: 1 })
    const result = await runBulkUpdate(ids(2), updateMany)

    expect(result.updated).toEqual([])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]!.error).toBeInstanceOf(BulkMatchShortfall)
    expect(result.failed[0]!.error).toMatchObject({ matched: 1, expected: 2 })
  })

  it('accepts a response without a count (nothing to compare against)', async () => {
    const result = await runBulkUpdate(ids(2), vi.fn().mockResolvedValue({}))
    expect(result.updated).toEqual(ids(2))
  })

  it('reports ids the server cannot address without sending them anywhere', async () => {
    const updateMany = vi.fn().mockImplementation(async (chunk: string[]) => ({ matchedCount: chunk.length }))
    const result = await runBulkUpdate([hex(1), 'doc-1', 'doc-2'], updateMany)

    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(updateMany).toHaveBeenCalledWith([hex(1)])
    expect(result.updated).toEqual([hex(1)])
    expect(result.failed).toEqual([
      { ids: ['doc-1'], error: expect.any(BulkUnaddressableId) },
      { ids: ['doc-2'], error: expect.any(BulkUnaddressableId) },
    ])
  })
})
