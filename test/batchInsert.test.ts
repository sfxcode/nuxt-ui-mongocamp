import { describe, it, expect, vi } from 'vitest'
import { runBatchInsert } from '../src/runtime/utils/batchInsert'

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ i }))

describe('runBatchInsert', () => {
  it('sends every row once, in order, in batches of the requested size', async () => {
    const insert = vi.fn().mockResolvedValue({})
    const result = await runBatchInsert(rows(7), insert, { batchSize: 3 })

    expect(insert.mock.calls.map(c => c[0].map((r: { i: number }) => r.i))).toEqual([[0, 1, 2], [3, 4, 5], [6]])
    expect(result).toEqual({ inserted: 7, failedBatches: [], rowErrors: [], skipped: 0, aborted: false })
  })

  it('handles batch boundaries: exact multiple, one more, one fewer', async () => {
    for (const [n, calls] of [[6, 2], [7, 3], [5, 2], [1, 1]] as const) {
      const insert = vi.fn().mockResolvedValue({})
      await runBatchInsert(rows(n), insert, { batchSize: 3 })
      expect(insert).toHaveBeenCalledTimes(calls)
    }
  })

  it('never calls insert for an empty input (the server answers 500 for an empty batch)', async () => {
    const insert = vi.fn()
    expect(await runBatchInsert([], insert)).toEqual({ inserted: 0, failedBatches: [], rowErrors: [], skipped: 0, aborted: false })
    expect(insert).not.toHaveBeenCalled()
  })

  it('reports a failed middle batch with its position and carries on with the rest', async () => {
    const boom = new Error('boom')
    const insert = vi.fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(boom)
      .mockResolvedValueOnce({})
    const result = await runBatchInsert(rows(9), insert, { batchSize: 3 })

    expect(result.inserted).toBe(6)
    expect(result.failedBatches).toEqual([{ start: 3, count: 3, error: boom, mayBePartial: true }])
  })

  it('marks a failure as not partial only when the caller says the server rejected it before writing', async () => {
    const rejected = { response: { status: 400 } }
    const other = { response: { status: 500 } }
    const insert = vi.fn().mockRejectedValueOnce(rejected).mockRejectedValueOnce(other)
    const result = await runBatchInsert(rows(4), insert, {
      batchSize: 2,
      isAtomicFailure: e => (e as typeof rejected).response.status === 400,
    })

    expect(result.failedBatches.map(f => f.mayBePartial)).toEqual([false, true])
  })

  it('stops before the next batch when aborted and counts the rows it never sent', async () => {
    const controller = new AbortController()
    const insert = vi.fn().mockImplementation(async () => {
      controller.abort()
    })
    const result = await runBatchInsert(rows(10), insert, { batchSize: 4, signal: controller.signal })

    expect(insert).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ inserted: 4, skipped: 6, aborted: true })
  })

  it('reports progress after each batch, including failed ones', async () => {
    const onProgress = vi.fn()
    const insert = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('x'))
    await runBatchInsert(rows(5), insert, { batchSize: 3, onProgress })

    expect(onProgress.mock.calls.map(c => c[0])).toEqual([{ done: 3, total: 5 }, { done: 5, total: 5 }])
  })

  it('clamps a nonsensical batch size to something usable', async () => {
    for (const batchSize of [0, -5, Number.NaN]) {
      const insert = vi.fn().mockResolvedValue({})
      const result = await runBatchInsert(rows(3), insert, { batchSize })
      expect(result.inserted).toBe(3)
      expect(insert.mock.calls.every(c => c[0].length >= 1)).toBe(true)
    }
    const insert = vi.fn().mockResolvedValue({})
    await runBatchInsert(rows(25_000), insert, { batchSize: 1_000_000 })
    expect(insert.mock.calls.every(c => c[0].length <= 10_000)).toBe(true)
  })

  describe('rows refused one by one (insertMany ordered=false)', () => {
    const dup = (index: number) => ({ index, code: 11000, message: 'E11000 duplicate key error' })

    it('counts what the server says landed and maps batch positions to input positions', async () => {
      const insert = vi.fn()
        .mockResolvedValueOnce({ insertedCount: 3, errors: [] })
        .mockResolvedValueOnce({ insertedCount: 2, errors: [dup(1)] })
      const result = await runBatchInsert(rows(6), insert, { batchSize: 3 })

      expect(result.inserted).toBe(5)
      expect(result.rowErrors).toEqual([{ index: 4, code: 11000, message: 'E11000 duplicate key error' }])
      expect(result.failedBatches).toEqual([expect.objectContaining({ start: 4, count: 1, mayBePartial: false })])
      expect((result.failedBatches[0]!.error as Error).message).toBe('E11000 duplicate key error')
    })

    it('makes neighbouring rows with the same message one range, and keeps different ones apart', async () => {
      const insert = vi.fn().mockResolvedValue({ insertedCount: 6, errors: [dup(0), dup(1), dup(2), { index: 4, code: 121, message: 'invalid' }, dup(6)] })
      const result = await runBatchInsert(rows(11), insert, { batchSize: 20 })

      expect(result.failedBatches.map(f => [f.start, f.count])).toEqual([[0, 3], [4, 1], [6, 1]])
    })

    it('keeps whole-batch failures and row failures in input order', async () => {
      const insert = vi.fn()
        .mockResolvedValueOnce({ insertedCount: 2, errors: [dup(2)] })
        .mockRejectedValueOnce(new Error('boom'))
      const result = await runBatchInsert(rows(6), insert, { batchSize: 3 })

      expect(result.failedBatches.map(f => [f.start, f.count])).toEqual([[2, 1], [3, 3]])
    })
  })
})
