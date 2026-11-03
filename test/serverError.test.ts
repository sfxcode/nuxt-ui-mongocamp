import { describe, it, expect } from 'vitest'
import { notAllowedOperator, OPERATOR_NOT_ALLOWED_CODE, readServerError } from '../src/runtime/utils/serverError'

const responseError = (status: number, body: unknown) => Object.assign(new Error('Response returned an error code'), {
  name: 'ResponseError',
  response: new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
})

describe('readServerError', () => {
  it('reads status, code and message from the { code, msg } body', async () => {
    const result = await readServerError(responseError(403, { code: 4031, msg: 'the operator $function is not allowed in an aggregation', additionalInfo: '' }))

    expect(result).toEqual({ status: 403, code: 4031, message: 'the operator $function is not allowed in an aggregation', kind: 'other' })
    expect(result.code).toBe(OPERATOR_NOT_ALLOWED_CODE)
  })

  it('reduces a failed MongoDB command to its own message and drops the database address', async () => {
    const msg = 'Command failed with error 15959 (Location15959): \'bad match\' on server 10.0.0.5:27017. The full response is {"ok": 0.0}'

    expect(await readServerError(responseError(500, { code: -1, msg }))).toEqual({ status: 500, code: -1, message: 'bad match', kind: 'mongo' })
  })

  it('never lets an address through in any message', async () => {
    const result = await readServerError(responseError(500, { code: -1, msg: 'Timed out on server 10.0.0.5:27017. Giving up' }))

    expect(result.message).not.toMatch(/10\.0\.0\.5|27017/)
  })

  it('knows the status even when the body is not JSON or empty (a proxy answer)', async () => {
    expect(await readServerError(responseError(503, ''))).toEqual({ status: 503 })
    expect(await readServerError(responseError(405, 'HTTP method not allowed, supported methods: OPTIONS'))).toEqual({ status: 405 })
  })

  it('keeps the code when there is no message, and ignores a non-numeric code or non-string message', async () => {
    expect(await readServerError(responseError(400, { code: 4001 }))).toEqual({ status: 400, code: 4001 })
    expect(await readServerError(responseError(400, { code: '4001', msg: 5 }))).toEqual({ status: 400, code: undefined })
    expect(await readServerError(responseError(400, null))).toEqual({ status: 400, code: undefined })
  })

  it('does not consume the original response: the body can be read again', async () => {
    const error = responseError(400, { code: 4001, msg: 'bad body' })

    await readServerError(error)

    expect(await error.response.json()).toEqual({ code: 4001, msg: 'bad body' })
  })

  it('returns what is known — and never throws — for errors without a readable response', async () => {
    expect(await readServerError(undefined)).toEqual({ status: undefined })
    expect(await readServerError(null)).toEqual({ status: undefined })
    expect(await readServerError(new Error('boom'))).toEqual({ status: undefined })
    expect(await readServerError(Object.assign(new Error('x'), { name: 'FetchError' }))).toEqual({ status: undefined })
    expect(await readServerError({ response: { status: 401 } })).toEqual({ status: 401 }) // a response without clone()
  })
})

describe('notAllowedOperator', () => {
  it('extracts the operator from the server message', () => {
    expect(notAllowedOperator('the operator $function is not allowed in an aggregation')).toBe('$function')
    expect(notAllowedOperator('the operator $out is not allowed in an aggregation')).toBe('$out')
  })

  it('returns undefined for anything else', () => {
    expect(notAllowedOperator('something else')).toBeUndefined()
    expect(notAllowedOperator(undefined)).toBeUndefined()
  })
})
