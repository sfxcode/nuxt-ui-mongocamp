import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, createPage, url } from '@nuxt/test-utils/e2e'
import { seedSession } from '../fixtures/auth/e2e-helpers'

describe('global auth middleware', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/auth', import.meta.url)),
  })

  it('renders the public index page with links to every tier', async () => {
    const page = await createPage('/')
    const text = await page.textContent('body')
    expect(text).toContain('public')
    expect(await page.locator('a', { hasText: 'secured link' }).count()).toBe(1)
    expect(await page.locator('a', { hasText: 'manage link' }).count()).toBe(1)
    expect(await page.locator('a', { hasText: 'admin link' }).count()).toBe(1)
    await page.close()
  })

  it('redirects an anonymous visitor away from every protected tier, to notAllowedPath', async () => {
    for (const path of ['/secured', '/secured/manage', '/secured/admin']) {
      const page = await createPage(path)
      await page.waitForURL('**/login')
      expect(page.url()).toContain('/login')
      await page.close()
    }
  })

  it('the notAllowedPath (/login) itself loads directly without being redirected, even though securedRouteParts also lists it', async () => {
    const page = await createPage('/login')
    expect(await page.textContent('body')).toContain('login page')
    expect(page.url()).toContain('/login')
    await page.close()
  })

  describe('secured tier', () => {
    it('anonymous: clicking through from the public page to the secured tier redirects to notAllowedPath', async () => {
      const page = await createPage('/')
      await page.locator('a', { hasText: 'secured link' }).click()
      await page.waitForURL('**/login')

      expect(page.url()).toContain('/login')
      expect(await page.textContent('body')).not.toContain('secured tier')
      await page.close()
    })

    it('logged in (no special roles): clicking through from the public page reaches the secured tier', async () => {
      const page = await createPage()
      await seedSession(page, { token: 'fake-token', profile: { user: 'carol', isAdmin: false, roles: [] } })
      await page.goto(url('/'))

      await page.locator('a', { hasText: 'secured link' }).click()
      await page.waitForURL('**/secured')

      expect(page.url()).toMatch(/\/secured$/)
      expect(await page.textContent('body')).toContain('secured tier')
      await page.close()
    })
  })

  describe('management tier', () => {
    it('logged in, no matching managerRoles role, not admin: blocked', async () => {
      const page = await createPage()
      await seedSession(page, { token: 'fake-token', profile: { user: 'dave', isAdmin: false, roles: ['other-role'] } })
      await page.goto(url('/'))

      await page.locator('a', { hasText: 'manage link' }).click()
      await page.waitForURL('**/login')

      expect(page.url()).toContain('/login')
      expect(await page.textContent('body')).not.toContain('management tier')
      await page.close()
    })

    it('logged in with a managerRoles-matching role: allowed', async () => {
      const page = await createPage()
      // fixture's nuxt.config.ts sets managerRoles: ['support']
      await seedSession(page, { token: 'fake-token', profile: { user: 'erin', isAdmin: false, roles: ['support'] } })
      await page.goto(url('/'))

      await page.locator('a', { hasText: 'manage link' }).click()
      await page.waitForURL('**/secured/manage')

      expect(await page.textContent('body')).toContain('management tier')
      await page.close()
    })

    it('logged in as admin with no matching role: also allowed (admin always counts as manager)', async () => {
      const page = await createPage()
      await seedSession(page, { token: 'fake-token', profile: { user: 'frank', isAdmin: true, roles: [] } })
      await page.goto(url('/'))

      await page.locator('a', { hasText: 'manage link' }).click()
      await page.waitForURL('**/secured/manage')

      expect(await page.textContent('body')).toContain('management tier')
      await page.close()
    })
  })

  describe('admin tier', () => {
    it('anonymous: blocked from the admin page (which is also covered by securedRouteParts)', async () => {
      const page = await createPage()
      await page.goto(url('/'))
      await page.locator('a', { hasText: 'admin link' }).click()
      await page.waitForURL('**/login')

      expect(await page.textContent('body')).not.toContain('admin tier')
      await page.close()
    })

    it('logged in but not admin: still blocked — isolates the admin check firing on its own, independent of the secured check (which a logged-in user already passes)', async () => {
      const page = await createPage()
      await seedSession(page, { token: 'fake-token', profile: { user: 'grace', isAdmin: false, roles: [] } })
      await page.goto(url('/'))

      await page.locator('a', { hasText: 'admin link' }).click()
      await page.waitForURL('**/login')

      expect(await page.textContent('body')).not.toContain('admin tier')
      await page.close()
    })

    it('logged in as admin: allowed', async () => {
      const page = await createPage()
      await seedSession(page, { token: 'fake-token', profile: { user: 'heidi', isAdmin: true, roles: [] } })
      await page.goto(url('/'))

      await page.locator('a', { hasText: 'admin link' }).click()
      await page.waitForURL('**/secured/admin')

      expect(await page.textContent('body')).toContain('admin tier')
      await page.close()
    })
  })

  describe('notAllowedPath', () => {
    it('stays reachable even for an anonymous visitor, despite securedRouteParts also listing it', async () => {
      // Regression guard for the exact guarantee useMongocampRoles.test.ts proves at the unit
      // level ("allows the default notAllowedPath even when securedRouteParts covers every
      // route") — here proven through the real middleware, against a fixture where
      // securedRouteParts explicitly includes '/login' (see nuxt.config.ts's comment).
      const page = await createPage()
      await page.goto(url('/login'))

      expect(page.url()).toContain('/login')
      expect(await page.textContent('body')).toContain('login page')
      await page.close()
    })
  })

  describe('/logout', () => {
    it('redirects to logoutRedirectPath and actually clears state — a subsequent secured navigation is blocked again', async () => {
      const page = await createPage()
      await seedSession(page, { token: 'fake-token', profile: { user: 'ivan', isAdmin: false, roles: [] } })
      await page.goto(url('/'))

      // sanity check: the seeded session can reach a secured page before logging out
      await page.locator('a', { hasText: 'secured link' }).click()
      await page.waitForURL('**/secured')
      expect(await page.textContent('body')).toContain('secured tier')

      await page.locator('a', { hasText: 'logout link' }).click()
      await page.waitForURL('**/login')
      expect(page.url()).toContain('/login')

      // logout() must have cleared the underlying storage, not just redirected once —
      // navigating to a secured page again should be blocked, exactly like a fresh anonymous visit
      await page.locator('a', { hasText: 'secured link' }).click()
      await page.waitForURL('**/login')
      expect(await page.textContent('body')).not.toContain('secured tier')

      await page.close()
    })
  })
})
