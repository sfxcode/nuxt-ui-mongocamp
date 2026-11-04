import { describe, expect, it } from 'vitest'
import { clampInterval, DEFAULT_BACKOFF_MAX_MS, MIN_REFRESH_INTERVAL_MS, nextDelay } from '../src/runtime/utils/autoRefresh'

describe('autoRefresh timing', () => {
  it('never goes below the minimum interval', () => {
    expect(clampInterval(10)).toBe(MIN_REFRESH_INTERVAL_MS)
    expect(clampInterval(Number.NaN)).toBe(MIN_REFRESH_INTERVAL_MS)
    expect(clampInterval(5500.9)).toBe(5500)
  })

  it('is the plain interval without failures or with backoff off', () => {
    expect(nextDelay(5000, 0)).toBe(5000)
    expect(nextDelay(5000, 4, false)).toBe(5000)
  })

  it('doubles per failure up to the cap', () => {
    expect(nextDelay(5000, 1)).toBe(10_000)
    expect(nextDelay(5000, 3)).toBe(40_000)
    expect(nextDelay(5000, 50)).toBe(DEFAULT_BACKOFF_MAX_MS)
    expect(nextDelay(5000, 1000, { factor: 3, maxMs: 20_000 })).toBe(20_000)
    expect(nextDelay(5000, 2, { factor: 3 })).toBe(45_000)
  })

  it('never caps below the interval and ignores a useless factor', () => {
    expect(nextDelay(60_000, 3, { maxMs: 1000 })).toBe(60_000)
    expect(nextDelay(5000, 1, { factor: 0.5 })).toBe(10_000)
  })
})
