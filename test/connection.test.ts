import { describe, it, expect } from 'vitest'
import { initialConnectionState, isNetworkFailure, nextConnectionState } from '../src/runtime/utils/connection'
import type { ConnectionState } from '../src/runtime/utils/connection'

describe('nextConnectionState', () => {
  const all: ConnectionState[] = ['online', 'offline', 'unreachable']

  it.each(all)('goes offline from %s when the browser reports no network', (from) => {
    expect(nextConnectionState(from, 'browser-offline')).toBe('offline')
  })

  it.each(all)('goes online from %s once the server answered', (from) => {
    expect(nextConnectionState(from, 'server-answered')).toBe('online')
  })

  it('treats a returning network as unproven until the server answers', () => {
    expect(nextConnectionState('offline', 'browser-online')).toBe('unreachable')
    expect(nextConnectionState('unreachable', 'browser-online')).toBe('unreachable')
    expect(nextConnectionState('online', 'browser-online')).toBe('online')
  })

  it('marks the server unreachable after a network failure, but keeps the browser\'s own offline verdict', () => {
    expect(nextConnectionState('online', 'network-failure')).toBe('unreachable')
    expect(nextConnectionState('unreachable', 'network-failure')).toBe('unreachable')
    expect(nextConnectionState('offline', 'network-failure')).toBe('offline')
  })
})

describe('initialConnectionState', () => {
  it('starts offline only when the browser says so', () => {
    expect(initialConnectionState(false)).toBe('offline')
    expect(initialConnectionState(true)).toBe('online')
    expect(initialConnectionState(undefined)).toBe('online')
  })
})

describe('isNetworkFailure', () => {
  function named(name: string, extra: Record<string, unknown> = {}) {
    return Object.assign(new Error(name), { name }, extra)
  }

  it('recognises failures without an answer', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkFailure(named('TimeoutError'))).toBe(true)
    expect(isNetworkFailure(named('AbortError'))).toBe(true)
    // generated MongoCamp client
    expect(isNetworkFailure(named('FetchError', { cause: new TypeError('Failed to fetch') }))).toBe(true)
    // ofetch / $fetch without a response
    expect(isNetworkFailure(named('FetchError'))).toBe(true)
    // a wrapper around one of them
    expect(isNetworkFailure(named('MongocampError', { cause: named('TimeoutError') }))).toBe(true)
  })

  it('never counts an HTTP answer as a network failure', () => {
    expect(isNetworkFailure(named('ResponseError', { response: { status: 401 } }))).toBe(false)
    expect(isNetworkFailure(named('FetchError', { statusCode: 500 }))).toBe(false)
    expect(isNetworkFailure(named('FetchError', { status: 404 }))).toBe(false)
    expect(isNetworkFailure(named('MongocampError', { status: 403, cause: new TypeError('x') }))).toBe(false)
  })

  it('ignores anything else', () => {
    expect(isNetworkFailure(new Error('boom'))).toBe(false)
    expect(isNetworkFailure('Failed to fetch')).toBe(false)
    expect(isNetworkFailure(null)).toBe(false)
    expect(isNetworkFailure(undefined)).toBe(false)
  })

  it('does not loop on a self-referencing cause', () => {
    const e = named('Weird')
    Object.assign(e, { cause: e })
    expect(isNetworkFailure(e)).toBe(false)
  })
})
