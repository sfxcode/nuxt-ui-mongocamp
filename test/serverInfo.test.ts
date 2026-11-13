import { describe, it, expect } from 'vitest'
import { connectionUsage, formatCount, formatUptime } from '../src/runtime/utils/serverInfo'

describe('formatUptime', () => {
  it.each([
    [199136, '2d 7h'],
    [3 * 3600 + 120, '3h 2m'],
    [7 * 60 + 3, '7m 3s'],
    [42, '42s'],
    [0, '0s'],
    [86400, '1d'],
  ])('%s s → %s', (seconds, expected) => expect(formatUptime(seconds)).toBe(expected))

  it('shows a dash for nothing, a negative or a bad number', () => {
    expect(formatUptime(null)).toBe('-')
    expect(formatUptime(undefined)).toBe('-')
    expect(formatUptime(-1)).toBe('-')
    expect(formatUptime(Number.NaN)).toBe('-')
  })
})

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(4294217)).toBe('4 294 217')
    expect(formatCount(999)).toBe('999')
    expect(formatCount(0)).toBe('0')
  })

  it('shows a dash for nothing', () => {
    expect(formatCount(null)).toBe('-')
    expect(formatCount(Number.NaN)).toBe('-')
  })
})

describe('connectionUsage', () => {
  it('is the share of connections in use', () => {
    expect(connectionUsage(296, 113)).toBe(72)
    expect(connectionUsage(0, 100)).toBe(0)
  })

  it('is null without numbers or without any connections', () => {
    expect(connectionUsage(undefined, 5)).toBeNull()
    expect(connectionUsage(0, 0)).toBeNull()
  })
})
