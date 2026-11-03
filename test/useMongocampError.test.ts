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

  describe('describeServerError (reads the { code, msg } body)', () => {
    const { describeServerError } = useMongocampError()
    const responseError = (status: number, body: unknown) => Object.assign(new Error('Response returned an error code'), {
      name: 'ResponseError',
      response: new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
    })

    it('shows a refused operator by name (code 4031 is not a missing permission)', async () => {
      const result = await describeServerError(responseError(403, { code: 4031, msg: 'the operator $function is not allowed in an aggregation' }))

      expect(result).toEqual({ kind: 'notAllowed', message: 'nuxtUiMongocamp.errors.notAllowedOperator' })
    })

    it('uses the generic not-allowed text when the operator cannot be read', async () => {
      expect((await describeServerError(responseError(403, { code: 4031, msg: 'not allowed' }))).message).toBe('nuxtUiMongocamp.errors.notAllowed')
      expect((await describeServerError(responseError(403, { code: 4031 }))).kind).toBe('notAllowed')
    })

    it('shows what the server said for a rejected request (400) as invalid, and for other statuses as other', async () => {
      expect(await describeServerError(responseError(400, { code: 4001, msg: 'the filter syntax is not supported' }))).toEqual({ kind: 'invalid', message: 'the filter syntax is not supported' })
      expect(await describeServerError(responseError(404, { code: -1, msg: 'could not find document' }))).toEqual({ kind: 'other', message: 'could not find document' })
      expect(await describeServerError(responseError(500, { code: -1, msg: 'something broke' }))).toEqual({ kind: 'other', message: 'something broke' })
    })

    it('keeps the fixed messages for 401, a plain 403 and network failures', async () => {
      expect((await describeServerError(responseError(401, { code: 4011, msg: 'user not authorized' }))).kind).toBe('unauthorized')
      expect((await describeServerError(responseError(403, { code: -1, msg: 'forbidden' }))).kind).toBe('forbidden')
      expect((await describeServerError(Object.assign(new Error('x'), { name: 'FetchError' }))).kind).toBe('network')
    })

    it('falls back to describeError when there is nothing to read', async () => {
      expect(await describeServerError(new Error('boom'))).toEqual({ kind: 'other', message: 'boom' })
      expect(await describeServerError(responseError(500, 'not json'))).toEqual({ kind: 'other', message: 'Response returned an error code' })
      expect((await describeServerError(undefined, 'nuxtUiMongocamp.databases.errorLoad')).message).toBe('nuxtUiMongocamp.databases.errorLoad')
    })

    it('never shows a database address', async () => {
      const result = await describeServerError(responseError(500, { code: -1, msg: 'Timed out on server 10.0.0.5:27017. Giving up' }))

      expect(result.message).not.toMatch(/10\.0\.0\.5|27017/)
    })
  })
})
