import { describe, it, expect, vi } from 'vitest'

vi.mock('#imports', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const { useMongocampError } = await import('../src/runtime/composables/useMongocampError')

describe('useMongocampError', () => {
  const { describeError } = useMongocampError()

  it('treats a FetchError as a network failure, not showing the library message', () => {
    const error = Object.assign(new Error('The request failed and the interceptors did not return an alternative response'), { name: 'FetchError' })
    expect(describeError(error)).toEqual({ kind: 'network', message: 'nuxtUiMongocamp.errors.network' })
  })

  it('maps HTTP 401 and 403 from a ResponseError to unauthorized / forbidden', () => {
    expect(describeError({ name: 'ResponseError', response: { status: 401 } }).kind).toBe('unauthorized')
    expect(describeError({ name: 'ResponseError', response: { status: 403 } }).kind).toBe('forbidden')
  })

  it('passes other errors through with their own message', () => {
    expect(describeError(new Error('boom'))).toEqual({ kind: 'other', message: 'boom' })
  })

  it('falls back to the given key, then to the generic one, when the error has no message', () => {
    expect(describeError(undefined, 'nuxtUiMongocamp.databases.errorLoad').message).toBe('nuxtUiMongocamp.databases.errorLoad')
    expect(describeError('weird').message).toBe('nuxtUiMongocamp.errors.generic')
  })
})
