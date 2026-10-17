import { describe, it, expect } from 'vitest'
import { rowsToCsv } from '../src/runtime/utils/exportRows'

describe('rowsToCsv', () => {
  it('writes a header row and one line per row, in the requested key order', () => {
    expect(rowsToCsv([{ b: 2, a: 'x' }], ['a', 'b'])).toBe('a,b\r\nx,2')
  })

  it('quotes cells containing commas, quotes or line breaks, doubling inner quotes', () => {
    const csv = rowsToCsv([{ a: 'one, two', b: 'say "hi"', c: 'line\nbreak' }], ['a', 'b', 'c'])
    expect(csv).toBe('a,b,c\r\n"one, two","say ""hi""","line\nbreak"')
  })

  it('renders null/undefined as empty and nested values as JSON', () => {
    expect(rowsToCsv([{ a: null, b: { x: 1 }, c: [1, 2] }], ['a', 'b', 'c', 'missing']))
      .toBe('a,b,c,missing\r\n,"{""x"":1}","[1,2]",')
  })
})
