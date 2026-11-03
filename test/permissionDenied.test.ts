import { describe, it, expect, vi } from 'vitest'
import { AdminApi, CollectionApi, Configuration } from '@sfxcode/nuxt-mongocamp-server/api'
import { installPermissionDeniedMiddleware, isPermissionDeniedBody, permissionDeniedMiddleware } from '../src/runtime/utils/permissionDenied'

const body = (msg: string, code = 4011) => JSON.stringify({ code, msg, additionalInfo: '' })

describe('isPermissionDeniedBody', () => {
  it('is true for a 401 that names what the user may not do', () => {
    expect(isPermissionDeniedBody(401, { code: 4011, msg: 'user not authorized for collection' })).toBe(true)
    expect(isPermissionDeniedBody(401, { code: 4011, msg: 'user not authorized for request' })).toBe(true)
    expect(isPermissionDeniedBody(401, { code: 4011, msg: '  User not authorized for collection ' })).toBe(true)
  })

  it('is false for a dead token — the same code with the plain message', () => {
    expect(isPermissionDeniedBody(401, { code: 4011, msg: 'user not authorized' })).toBe(false)
  })

  it('is false for any other status, code, message or shape', () => {
    expect(isPermissionDeniedBody(403, { code: 4011, msg: 'user not authorized for collection' })).toBe(false)
    expect(isPermissionDeniedBody(401, { code: -1, msg: 'user not authorized for collection' })).toBe(false)
    expect(isPermissionDeniedBody(401, { code: 4011, msg: 'user not authorized forever' })).toBe(false)
    expect(isPermissionDeniedBody(401, { code: 4011, msg: 5 })).toBe(false)
    expect(isPermissionDeniedBody(401, { code: 4011 })).toBe(false)
    expect(isPermissionDeniedBody(401, null)).toBe(false)
    expect(isPermissionDeniedBody(401, 'user not authorized for collection')).toBe(false)
    expect(isPermissionDeniedBody(200, { code: 4011, msg: 'user not authorized for collection' })).toBe(false)
  })
})

describe('permissionDeniedMiddleware', () => {
  const run = (response: Response) => permissionDeniedMiddleware.post!({ fetch, url: 'http://x/y', init: {}, response })

  it('turns a permission 401 into a 403 with the same body and headers', async () => {
    const original = new Response(body('user not authorized for collection'), { status: 401, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } })

    const result = await run(original.clone())

    expect(result).toBeInstanceOf(Response)
    expect(result!.status).toBe(403)
    expect(result!.statusText).toBe('Forbidden')
    expect(result!.headers.get('access-control-allow-origin')).toBe('*')
    expect(await result!.json()).toEqual({ code: 4011, msg: 'user not authorized for collection', additionalInfo: '' })
  })

  it('leaves everything else alone: a dead token, other statuses, an unreadable body', async () => {
    expect(await run(new Response(body('user not authorized'), { status: 401 }))).toBeUndefined()
    expect(await run(new Response(body('user not authorized for collection'), { status: 403 }))).toBeUndefined()
    expect(await run(new Response('[]', { status: 200 }))).toBeUndefined()
    expect(await run(new Response('not json', { status: 401 }))).toBeUndefined()
    expect(await run(new Response('', { status: 401 }))).toBeUndefined()
  })
})

describe('installPermissionDeniedMiddleware, with the real generated API classes', () => {
  // what the dependency's own configuration does: clear the session on any 401, leave other statuses alone
  const clearSession = vi.fn()
  const dependencyMiddleware = {
    post: async ({ response }: { response: Response }) => {
      if (response.status === 401) clearSession()
      return response
    },
  }
  const apisFor = (respond: () => Response) => {
    const configuration = new Configuration({ basePath: 'http://localhost:9', fetchApi: async () => respond(), middleware: [dependencyMiddleware] })
    return { adminApi: new AdminApi(configuration), collectionApi: new CollectionApi(configuration) }
  }

  it('keeps the session on a missing grant: the call rejects with a 403 and the dependency never sees a 401', async () => {
    clearSession.mockClear()
    const apis = installPermissionDeniedMiddleware(apisFor(() => new Response(body('user not authorized for collection'), { status: 401 })))

    await expect(apis.collectionApi.listCollections()).rejects.toMatchObject({ name: 'ResponseError', response: { status: 403 } })
    await expect(apis.adminApi.listUsers({ filter: '' })).rejects.toMatchObject({ response: { status: 403 } })

    expect(clearSession).not.toHaveBeenCalled()
  })

  it('still clears the session for a dead token: the 401 reaches the dependency unchanged', async () => {
    clearSession.mockClear()
    const apis = installPermissionDeniedMiddleware(apisFor(() => new Response(body('user not authorized'), { status: 401 })))

    await expect(apis.collectionApi.listCollections()).rejects.toMatchObject({ response: { status: 401 } })

    expect(clearSession).toHaveBeenCalledTimes(1)
  })

  it('without the middleware the same missing-grant 401 would clear the session (what this module prevents)', async () => {
    clearSession.mockClear()
    const apis = apisFor(() => new Response(body('user not authorized for collection'), { status: 401 }))

    await expect(apis.collectionApi.listCollections()).rejects.toMatchObject({ response: { status: 401 } })

    expect(clearSession).toHaveBeenCalledTimes(1)
  })

  it('covers every API instance built from the same configuration, and is installed once', () => {
    const apis = apisFor(() => new Response('[]'))
    // declared private in the generated d.ts, a plain field at runtime
    const middlewareOf = (api: unknown) => (api as { middleware: unknown[] }).middleware

    installPermissionDeniedMiddleware(apis)
    installPermissionDeniedMiddleware(apis)

    expect(middlewareOf(apis.adminApi)[0]).toBe(permissionDeniedMiddleware)
    expect(middlewareOf(apis.collectionApi)[0]).toBe(permissionDeniedMiddleware)
    expect(middlewareOf(apis.adminApi).filter(m => m === permissionDeniedMiddleware)).toHaveLength(1)
    expect(middlewareOf(apis.adminApi)).toHaveLength(2)
  })

  it('returns what it was given and leaves a test double without a middleware list alone', () => {
    const double = { adminApi: {}, documentApi: 'x' }

    expect(installPermissionDeniedMiddleware(double)).toBe(double)
    expect(installPermissionDeniedMiddleware({})).toEqual({})
  })

  it('passes a normal answer through untouched', async () => {
    const apis = installPermissionDeniedMiddleware(apisFor(() => new Response('["a","b"]', { status: 200, headers: { 'content-type': 'application/json' } })))

    expect(await apis.collectionApi.listCollections()).toEqual(['a', 'b'])
  })
})
