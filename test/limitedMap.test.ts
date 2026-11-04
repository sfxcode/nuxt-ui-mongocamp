import { describe, expect, it, vi } from 'vitest'
import { mapLimit } from '../src/runtime/utils/limitedMap'

describe('mapLimit', () => {
  it('returns every result in input order', async () => {
    const out = await mapLimit([3, 1, 2], 2, async n => n * 10)
    expect(out).toEqual([{ ok: true, value: 30 }, { ok: true, value: 10 }, { ok: true, value: 20 }])
  })

  it('never runs more than the limit at once', async () => {
    let running = 0
    let peak = 0
    await mapLimit(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      peak = Math.max(peak, ++running)
      await new Promise(resolve => setTimeout(resolve, 5))
      running--
    })
    expect(peak).toBe(3)
  })

  it('keeps going after a failure and reports it in place', async () => {
    const boom = new Error('x')
    const out = await mapLimit(['a', 'b', 'c'], 2, async (s) => {
      if (s === 'b') throw boom
      return s
    })
    expect(out).toEqual([{ ok: true, value: 'a' }, { ok: false, error: boom }, { ok: true, value: 'c' }])
  })

  it('stops starting calls after an abort; unstarted items are undefined', async () => {
    const controller = new AbortController()
    const fn = vi.fn(async (n: number) => {
      if (n === 1) controller.abort()
      return n
    })
    const out = await mapLimit([0, 1, 2, 3, 4], 1, fn, { signal: controller.signal })
    expect(fn).toHaveBeenCalledTimes(2)
    expect(out.map(r => r?.ok)).toEqual([true, true, undefined, undefined, undefined])
  })

  it('does nothing when already aborted, and handles an empty list and a silly limit', async () => {
    const controller = new AbortController()
    controller.abort()
    const fn = vi.fn(async () => 1)
    expect(await mapLimit([1, 2], 2, fn, { signal: controller.signal })).toEqual([undefined, undefined])
    expect(fn).not.toHaveBeenCalled()
    expect(await mapLimit([], 4, fn)).toEqual([])
    expect((await mapLimit([1, 2], 0, async n => n)).map(r => r?.ok)).toEqual([true, true])
  })

  it('reports progress per finished item', async () => {
    const seen: Array<[number, number]> = []
    await mapLimit([1, 2, 3], 2, async n => n, { onProgress: (done, total) => seen.push([done, total]) })
    expect(seen).toEqual([[1, 3], [2, 3], [3, 3]])
  })
})
