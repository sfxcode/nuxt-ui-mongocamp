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
})
