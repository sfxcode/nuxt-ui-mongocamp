import { describe, it, expect } from 'vitest'
import { parseJsonKeepingLongs, readJsonKeepingLongs } from '../src/runtime/utils/bigIntJson'

const long = (digits: string) => ({ $numberLong: digits })

describe('parseJsonKeepingLongs', () => {
  it('keeps an integer beyond 2^53 exact, which JSON.parse would round', () => {
    expect(JSON.parse('{"big":9007199254740993}').big).toBe(9007199254740992) // what the generated client does
    expect(parseJsonKeepingLongs('{"big":9007199254740993}')).toEqual({ big: long('9007199254740993') })
    expect(parseJsonKeepingLongs('[9223372036854775807]')).toEqual([long('9223372036854775807')])
    expect(parseJsonKeepingLongs('{"n":-9223372036854775808}')).toEqual({ n: long('-9223372036854775808') })
  })

  it('leaves safe integers, including the 16-digit boundary, alone', () => {
    expect(parseJsonKeepingLongs('[9007199254740991,-9007199254740991,123,0,-1,1234567890123456]')).toEqual([9007199254740991, -9007199254740991, 123, 0, -1, 1234567890123456])
  })

  it('wraps exactly the first unsafe integer: 2^53 itself', () => {
    expect(parseJsonKeepingLongs('[9007199254740992]')).toEqual([long('9007199254740992')])
  })

  it('leaves decimals and exponents alone, however many digits they have', () => {
    const text = '[0.1,12345678901234567.5,1e20,1.5E+3,-2.5e-3,9007199254740993.0]'

    expect(parseJsonKeepingLongs(text)).toEqual(JSON.parse(text)) // exactly what JSON.parse gives: no wrappers appear
  })

  it('never touches digits inside strings, including escaped quotes', () => {
    const text = '{"s":"9007199254740993","t":"a\\"9007199254740993\\"b","k9007199254740993":1}'

    expect(parseJsonKeepingLongs(text)).toEqual({ s: '9007199254740993', t: 'a"9007199254740993"b', k9007199254740993: 1 })
  })

  it('handles nested documents, arrays, mixed values and whitespace', () => {
    const text = '[ {"a": { "b": [ 9007199254740993 , true, null, "x" ] }, "c": 7 }, 12345678901234567890 ]'

    expect(parseJsonKeepingLongs(text)).toEqual([{ a: { b: [long('9007199254740993'), true, null, 'x'] }, c: 7 }, long('12345678901234567890')])
  })

  it('handles a literal at the very end and a document that is only a number', () => {
    expect(parseJsonKeepingLongs('9007199254740993')).toEqual(long('9007199254740993'))
    expect(parseJsonKeepingLongs('123')).toBe(123)
  })

  it('is plain JSON.parse for everything else', () => {
    const text = '{"a":[1,2.5,"x",null,true,false,{"b":-3}],"c":"é\\u00e9\\n"}'

    expect(parseJsonKeepingLongs(text)).toEqual(JSON.parse(text))
  })

  it('throws for invalid JSON, like JSON.parse', () => {
    expect(() => parseJsonKeepingLongs('{"a":')).toThrow()
    expect(() => parseJsonKeepingLongs('not json')).toThrow()
    expect(() => parseJsonKeepingLongs('')).toThrow()
  })
})

describe('readJsonKeepingLongs', () => {
  it('reads the text of a clone of the raw response, leaving the original readable', async () => {
    const raw = new Response('[{"big":9007199254740993}]')
    const value = async () => raw.json() // the generated client's own reading

    expect(await readJsonKeepingLongs({ raw, value })).toEqual([{ big: long('9007199254740993') }])
    expect(await value()).toEqual([{ big: 9007199254740992 }])
  })

  it('falls back to value() without a readable raw response (a test double, a missing raw)', async () => {
    expect(await readJsonKeepingLongs({ value: async () => [1, 2] })).toEqual([1, 2])
    expect(await readJsonKeepingLongs({ raw: { headers: {} } as unknown as Response, value: async () => ['x'] })).toEqual(['x'])
  })

  it('falls back to value() when the body is not JSON', async () => {
    expect(await readJsonKeepingLongs({ raw: new Response('not json'), value: async () => 'client reading' })).toBe('client reading')
  })
})
