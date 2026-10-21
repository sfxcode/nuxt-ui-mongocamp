import { describe, it, expect, vi } from 'vitest'
import { createThrottled } from '../src/runtime/utils/throttled'

function setup<T>(fn: () => Promise<T>, cooldownMs = 5000) {
  let nowMs = 1_000_000
  const spy = vi.fn(fn)
  const throttled = createThrottled(spy, { now: () => nowMs, cooldownMs })
  return { throttled, spy, advance: (ms: number) => {
    nowMs += ms
  } }
}

describe('createThrottled', () => {
  it('runs the function and returns its result', async () => {
    const { throttled } = setup(() => Promise.resolve('x'))

    expect(await throttled()).toBe('x')
  })

  it('shares one run between concurrent callers', async () => {
    let resolve!: (v: string) => void
    const { throttled, spy } = setup(() => new Promise<string>((r) => {
      resolve = r
    }))

    const calls = [throttled(), throttled(), throttled()]
    resolve('done')

    expect(await Promise.all(calls)).toEqual(['done', 'done', 'done'])
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('answers from the last result during the cooldown, then runs again', async () => {
    let n = 0
    const { throttled, spy, advance } = setup(() => Promise.resolve(++n))

    expect(await throttled()).toBe(1)
    advance(4999)
    expect(await throttled()).toBe(1)
    advance(1)
    expect(await throttled()).toBe(2)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('does not stay stuck in flight, and does not cache, after a rejection', async () => {
    let n = 0
    const { throttled, spy } = setup(() => (++n === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('ok')))

    await expect(throttled()).rejects.toThrow('boom')
    expect(await throttled()).toBe('ok')
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
