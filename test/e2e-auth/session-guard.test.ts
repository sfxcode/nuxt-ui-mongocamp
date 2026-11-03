import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, createPage, url } from '@nuxt/test-utils/e2e'
import { fakeJwt, hasSessionToken, seedSession } from '../fixtures/auth/e2e-helpers'

const profile = { user: 'carol', isAdmin: false, roles: [] }

describe('session guard (sessionGuard: true, loginPath: /login)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/auth', import.meta.url)),
  })

  it('an expired token on a secured route: the session is cleared and the visit lands on loginPath', async () => {
    const page = await createPage()
    await seedSession(page, { token: fakeJwt(-3600), profile })

    await page.goto(url('/secured'))
    await page.waitForURL('**/login')

    expect(page.url()).toContain('/login')
    expect(await page.textContent('body')).not.toContain('secured tier')
    expect(await hasSessionToken(page)).toBe(false)
    await page.close()
  })

  it('a token that has not expired keeps the session and reaches the secured route', async () => {
    const page = await createPage()
    await seedSession(page, { token: fakeJwt(3600), profile })

    await page.goto(url('/secured'))

    expect(page.url()).toContain('/secured')
    expect(page.url()).not.toContain('/login')
    expect(await page.textContent('body')).toContain('secured tier')
    expect(await hasSessionToken(page)).toBe(true)
    await page.close()
  })

  it('a token it cannot read is not treated as expired: no logout, no redirect', async () => {
    const page = await createPage()
    await seedSession(page, { token: 'not-a-jwt', profile })

    await page.goto(url('/secured'))

    expect(page.url()).not.toContain('/login')
    expect(await page.textContent('body')).toContain('secured tier')
    expect(await hasSessionToken(page)).toBe(true)
    await page.close()
  })

  it('an expired token on a public page: the session is cleared but the visitor stays', async () => {
    const page = await createPage()
    await seedSession(page, { token: fakeJwt(-3600), profile })

    await page.goto(url('/'))

    expect(new URL(page.url()).pathname).toBe('/')
    expect(await page.textContent('body')).toContain('public')
    expect(await hasSessionToken(page)).toBe(false)
    await page.close()
  })

  it('an expired token on loginPath itself: the session is cleared and there is no redirect loop', async () => {
    const page = await createPage()
    await seedSession(page, { token: fakeJwt(-3600), profile })

    await page.goto(url('/login'))

    expect(new URL(page.url()).pathname).toBe('/login')
    expect(await page.textContent('body')).toContain('login page')
    expect(await hasSessionToken(page)).toBe(false)
    await page.close()
  })

  const AUTH_URL = 'http://localhost:9999/auth/authenticated'
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }

  it('server check: a locally valid token the server rejects (readable 401) is cleared and the visit lands on loginPath', async () => {
    const page = await createPage()
    await page.route(AUTH_URL, route => route.fulfill({ status: 401, headers: cors, contentType: 'application/json', body: '{"code":4011,"msg":"user not authorized"}' }))
    await seedSession(page, { token: fakeJwt(3600), profile })

    await page.goto(url('/secured'))
    await page.waitForURL('**/login')
    // the server skips the check, so the first (server-rendered) page is checked after hydration
    await expect.poll(() => hasSessionToken(page)).toBe(false)
    expect(page.url()).toContain('/login')
    await page.close()
  })

  it('server check: on a client-side navigation the rejected token is cleared and the login page is shown', async () => {
    const page = await createPage()
    await page.route(AUTH_URL, route => route.fulfill({ status: 401, headers: cors, contentType: 'application/json', body: '{"code":4011,"msg":"user not authorized"}' }))
    await seedSession(page, { token: fakeJwt(3600), profile })

    await page.goto(url('/login'))
    await expect.poll(() => hasSessionToken(page)).toBe(false) // cleared on the login path itself, nothing to redirect
    await page.click('text=secured link')
    await page.waitForURL('**/login')
    await page.waitForSelector('text=login page')

    expect(await page.textContent('body')).not.toContain('secured tier')
    expect(await hasSessionToken(page)).toBe(false)
    await page.close()
  })

  it('server check: a token the server accepts keeps the session', async () => {
    const page = await createPage()
    await page.route(AUTH_URL, route => route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{"value":true}' }))
    await seedSession(page, { token: fakeJwt(3600), profile })

    await page.goto(url('/secured'))

    expect(page.url()).toContain('/secured')
    expect(await page.textContent('body')).toContain('secured tier')
    expect(await hasSessionToken(page)).toBe(true)
    await page.close()
  })

  it('server check: no answer at all (network failure) never logs anyone out', async () => {
    const page = await createPage()
    await page.route(AUTH_URL, route => route.abort('connectionrefused'))
    await seedSession(page, { token: fakeJwt(3600), profile })

    await page.goto(url('/secured'))

    expect(page.url()).toContain('/secured')
    expect(await hasSessionToken(page)).toBe(true)
    await page.close()
  })
})
