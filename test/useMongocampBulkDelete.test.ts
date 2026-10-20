import { describe, it, expect, vi } from 'vitest'
import { runBulkDelete } from '../src/runtime/utils/bulkDelete'

describe('runBulkDelete', () => {
  it('deletes every item and reports them in input order', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    const result = await runBulkDelete(['a', 'b', 'c'], remove)

    expect(result).toEqual({ deleted: ['a', 'b', 'c'], failed: [] })
    expect(remove).toHaveBeenCalledTimes(3)
  })

  it('keeps going after a failure and reports exactly which items failed and why', async () => {
    const boom = new Error('forbidden')
    const remove = vi.fn(async (id: string) => {
      if (id === 'b') throw boom
    })
    const result = await runBulkDelete(['a', 'b', 'c', 'd'], remove)

    expect(result.deleted).toEqual(['a', 'c', 'd'])
    expect(result.failed).toEqual([{ item: 'b', error: boom }])
    expect(remove).toHaveBeenCalledTimes(4)
  })

  it('never runs more than `concurrency` deletions at once', async () => {
    let running = 0
    let peak = 0
    const remove = async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise(resolve => setTimeout(resolve, 5))
      running--
    }
    await runBulkDelete(Array.from({ length: 12 }, (_, i) => i), remove, 3)

    expect(peak).toBe(3)
  })

  it('does nothing for an empty selection', async () => {
    const remove = vi.fn()
    expect(await runBulkDelete([], remove)).toEqual({ deleted: [], failed: [] })
    expect(remove).not.toHaveBeenCalled()
  })
})

describe('runBulkDelete with removeMany', () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => `id${i}`)

  it('deletes in chunks with one request each and never touches the per-item path', async () => {
    const remove = vi.fn()
    const run = vi.fn(async (chunk: string[]) => chunk.length)
    const all = items(250)
    const result = await runBulkDelete(all, remove, 5, { run })

    expect(run.mock.calls.map(c => c[0].length)).toEqual([100, 100, 50])
    expect(remove).not.toHaveBeenCalled()
    expect(result).toEqual({ deleted: all, failed: [] })
  })

  it('never calls run for an empty selection (an empty filter would delete the whole collection)', async () => {
    const run = vi.fn()
    expect(await runBulkDelete([], vi.fn(), 5, { run })).toEqual({ deleted: [], failed: [] })
    expect(run).not.toHaveBeenCalled()
  })

  it('never calls run when no item can be handled by it', async () => {
    const run = vi.fn()
    const remove = vi.fn().mockResolvedValue(undefined)
    const result = await runBulkDelete(['x', 'y'], remove, 5, { run, canHandle: () => false })

    expect(run).not.toHaveBeenCalled()
    expect(result.deleted).toEqual(['x', 'y'])
  })

  it('sends items it cannot handle straight to the per-item delete and keeps the input order', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    const run = vi.fn(async (chunk: string[]) => chunk.length)
    const result = await runBulkDelete(['a', 'odd1', 'b', 'odd2'], remove, 5, { run, canHandle: id => !id.startsWith('odd') })

    expect(run).toHaveBeenCalledWith(['a', 'b'])
    expect(remove.mock.calls.map(c => c[0]).sort()).toEqual(['odd1', 'odd2'])
    expect(result.deleted).toEqual(['a', 'odd1', 'b', 'odd2'])
  })

  it('falls back to per-item deletes for a chunk whose request throws, and still batches the others', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementationOnce(async (chunk: string[]) => chunk.length)
    const all = items(150)
    const result = await runBulkDelete(all, remove, 5, { run })

    expect(remove.mock.calls.map(c => c[0]).sort()).toEqual(all.slice(0, 100).sort())
    expect(result.deleted).toEqual(all)
  })

  it('never reports a short count as success: that chunk is re-deleted one by one', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    const result = await runBulkDelete(items(3), remove, 5, { run: async () => 2 })

    expect(remove).toHaveBeenCalledTimes(3)
    expect(result.deleted).toEqual(items(3))
  })

  it('treats a missing count like a short one', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    await runBulkDelete(items(2), remove, 5, { run: async () => undefined })
    expect(remove).toHaveBeenCalledTimes(2)
  })

  it('reports what the per-item fallback could not delete, with the real error', async () => {
    const boom = new Error('forbidden')
    const remove = vi.fn(async (id: string) => {
      if (id === 'id1') throw boom
    })
    const result = await runBulkDelete(items(3), remove, 5, { run: vi.fn().mockRejectedValue(new Error('fast path down')) })

    expect(result.deleted).toEqual(['id0', 'id2'])
    expect(result.failed).toEqual([{ item: 'id1', error: boom }])
  })

  it('honours a custom chunk size', async () => {
    const run = vi.fn(async (chunk: string[]) => chunk.length)
    await runBulkDelete(items(5), vi.fn(), 5, { run, chunkSize: 2 })
    expect(run.mock.calls.map(c => c[0].length)).toEqual([2, 2, 1])
  })
})
