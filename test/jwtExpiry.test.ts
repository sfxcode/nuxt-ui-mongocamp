import { describe, it, expect } from 'vitest'
import { getTokenExpiry, tokenExpiryState } from '../src/runtime/utils/jwtExpiry'

function b64url(value: string | Uint8Array): string {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// the signature is never checked, so any text will do
function tokenWith(payload: unknown, header: unknown = { alg: 'HS256', typ: 'JWT' }): string {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return `${b64url(JSON.stringify(header))}.${b64url(body)}.${b64url('signature')}`
}

const NOW = 1_800_000_000_000 // ms
const NOW_S = NOW / 1000

describe('getTokenExpiry', () => {
  it('returns exp (seconds) of a well-formed token', () => {
    expect(getTokenExpiry(tokenWith({ exp: NOW_S + 60, user: 'a' }))).toBe(NOW_S + 60)
  })

  it('accepts base64url characters (- and _) in the payload', () => {
    // a payload whose base64 contains '+' and '/' in the standard alphabet
    const payload = { exp: 1234567890, note: '???>>>~~~' }
    const token = tokenWith(payload)
    expect(token.split('.')[1]).toMatch(/[-_]/)
    expect(getTokenExpiry(token)).toBe(1234567890)
  })

  it('accepts padded base64 too', () => {
    const body = Buffer.from(JSON.stringify({ exp: 42 })).toString('base64')
    expect(getTokenExpiry(`x.${body}.y`)).toBe(42)
  })

  it.each([
    ['empty string', ''],
    ['one part', 'abc'],
    ['two parts', 'abc.def'],
    ['four parts', 'a.b.c.d'],
    ['payload that is not base64', 'a.!!!.c'],
    ['payload that is not JSON', `a.${b64url('not json')}.c`],
    ['payload that is JSON but not an object', tokenWith('123')],
    ['payload that is an array', tokenWith([1, 2])],
    ['payload that is null', tokenWith('null')],
  ])('returns null for %s', (_name, token) => {
    expect(getTokenExpiry(token)).toBeNull()
  })

  it.each([
    ['missing exp', { user: 'a' }],
    ['string exp', { exp: '1800000000' }],
    ['null exp', { exp: null }],
    ['NaN-ish exp', { exp: 'soon' }],
    ['negative exp', { exp: -5 }],
    ['zero exp', { exp: 0 }],
    ['object exp', { exp: { a: 1 } }],
  ])('returns null for %s', (_name, payload) => {
    expect(getTokenExpiry(tokenWith(payload))).toBeNull()
  })

  it('never throws on non-string input', () => {
    expect(getTokenExpiry(undefined as unknown as string)).toBeNull()
    expect(getTokenExpiry(null as unknown as string)).toBeNull()
    expect(getTokenExpiry(42 as unknown as string)).toBeNull()
  })
})

describe('tokenExpiryState', () => {
  it('is valid before exp', () => {
    expect(tokenExpiryState(tokenWith({ exp: NOW_S + 3600 }), NOW)).toBe('valid')
  })

  it('is expired well after exp', () => {
    expect(tokenExpiryState(tokenWith({ exp: NOW_S - 3600 }), NOW)).toBe('expired')
  })

  it('allows leeway for client clock skew: just past exp is still valid, past exp + leeway is expired', () => {
    const token = tokenWith({ exp: NOW_S - 10 })
    expect(tokenExpiryState(token, NOW, 30)).toBe('valid')
    expect(tokenExpiryState(token, NOW, 5)).toBe('expired')
  })

  it('treats exactly exp + leeway as still valid and one second later as expired', () => {
    const token = tokenWith({ exp: NOW_S - 30 })
    expect(tokenExpiryState(token, NOW, 30)).toBe('valid')
    expect(tokenExpiryState(token, NOW + 1000, 30)).toBe('expired')
  })

  it('defaults to a small leeway rather than none', () => {
    expect(tokenExpiryState(tokenWith({ exp: NOW_S - 1 }), NOW)).toBe('valid')
  })

  it('is unknown — never expired — for anything it cannot read', () => {
    expect(tokenExpiryState('', NOW)).toBe('unknown')
    expect(tokenExpiryState('garbage', NOW)).toBe('unknown')
    expect(tokenExpiryState(tokenWith({ user: 'a' }), NOW)).toBe('unknown')
    expect(tokenExpiryState(undefined as unknown as string, NOW)).toBe('unknown')
  })

  it('uses the current time when none is given', () => {
    expect(tokenExpiryState(tokenWith({ exp: Math.floor(Date.now() / 1000) + 3600 }))).toBe('valid')
    expect(tokenExpiryState(tokenWith({ exp: Math.floor(Date.now() / 1000) - 3600 }))).toBe('expired')
  })
})
