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
