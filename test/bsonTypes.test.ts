import { describe, expect, it } from 'vitest'
import { wireValue } from '../src/runtime/utils/bsonTypes'

describe('wireValue', () => {
  it('int: a whole number in the int32 range, as a number or numeric text', () => {
    expect(wireValue('int', 5)).toEqual({ $numberInt: '5' })
    expect(wireValue('int', '7')).toEqual({ $numberInt: '7' })
    expect(wireValue('int', -(2 ** 31))).toEqual({ $numberInt: '-2147483648' })
    expect(wireValue('int', 2 ** 31 - 1)).toEqual({ $numberInt: '2147483647' })
  })

  it('int: a value that does not fit is returned unchanged for the server to type', () => {
    expect(wireValue('int', 2.5)).toBe(2.5)
    expect(wireValue('int', 2 ** 31)).toBe(2 ** 31)
    expect(wireValue('int', 'abc')).toBe('abc')
    expect(wireValue('int', '')).toBe('')
    expect(wireValue('int', Number.NaN)).toBeNaN()
  })

  it('long: keeps every digit of a text, and writes a safe integer number', () => {
    expect(wireValue('long', '9007199254740993')).toEqual({ $numberLong: '9007199254740993' })
    expect(wireValue('long', ' -12 ')).toEqual({ $numberLong: '-12' })
    expect(wireValue('long', 42)).toEqual({ $numberLong: '42' })
    expect(wireValue('long', 2 ** 60)).toBe(2 ** 60) // not exact as a number: left to the caller to pass the digits
    expect(wireValue('long', 1.5)).toBe(1.5)
  })

  it('double and decimal', () => {
    expect(wireValue('double', 1.5)).toEqual({ $numberDouble: '1.5' })
    expect(wireValue('double', '2')).toEqual({ $numberDouble: '2' })
    expect(wireValue('double', 'x')).toBe('x')
    expect(wireValue('decimal', '2.50')).toEqual({ $numberDecimal: '2.50' }) // the typed digits stay
    expect(wireValue('decimal', 3.75)).toEqual({ $numberDecimal: '3.75' })
    expect(wireValue('decimal', '1e3')).toEqual({ $numberDecimal: '1e3' })
    expect(wireValue('decimal', 'x')).toBe('x')
  })

  it('date: a full ISO timestamp; anything else stays text', () => {
    expect(wireValue('date', '2026-01-01T00:00:00.000Z')).toEqual({ $date: '2026-01-01T00:00:00.000Z' })
    expect(wireValue('date', '2026-01-01')).toBe('2026-01-01')
    expect(wireValue('date', 5)).toBe(5)
  })

  it('objectId: 24 hex characters', () => {
    expect(wireValue('objectId', '507f1f77bcf86cd799439011')).toEqual({ $oid: '507f1f77bcf86cd799439011' })
    expect(wireValue('objectId', 'nope')).toBe('nope')
  })

  it('string: date-looking text is marked as text, ordinary text is untouched', () => {
    expect(wireValue('string', '2026-01-01T00:00:00.000Z')).toEqual({ $string: '2026-01-01T00:00:00.000Z' })
    expect(wireValue('string', 'hello')).toBe('hello')
    expect(wireValue('string', '2026-01-01')).toBe('2026-01-01') // a bare date is text on the server anyway
    expect(wireValue('string', 12)).toBe(12)
  })

  it('bool and null pass through', () => {
    expect(wireValue('bool', true)).toBe(true)
    expect(wireValue('null', null)).toBeNull()
  })
})
