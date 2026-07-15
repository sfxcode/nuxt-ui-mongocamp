import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, createPage, url } from '@nuxt/test-utils/e2e'
import { seedSession } from '../fixtures/auth/e2e-helpers'

// Proves the seeding mechanism itself works before any middleware-behavior test depends on
// it — a passing middleware test built on top of a broken seed would be a false positive.
describe('session seeding', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/auth', import.meta.url)),
  })

  it('a seeded admin profile with roles is reflected by useMongocampAuth/useMongocampStorage after hydration', async () => {
    const page = await createPage()
    await seedSession(page, { token: 'fake-token', profile: { user: 'alice', isAdmin: true, roles: ['support'] } })
    await page.goto(url('/debug'))

    const json = await page.locator('[data-test="debug-json"]').textContent()
    const parsed = JSON.parse(json!)
    expect(parsed).toEqual({ isLoggedIn: true, isAdmin: true, roles: ['support'], user: 'alice' })
    await page.close()
  })

  it('negative check: seeding isAdmin false does not show isAdmin true (not a stale-default pass)', async () => {
    const page = await createPage()
    await seedSession(page, { token: 'fake-token', profile: { user: 'bob', isAdmin: false, roles: [] } })
    await page.goto(url('/debug'))

    const json = await page.locator('[data-test="debug-json"]').textContent()
    const parsed = JSON.parse(json!)
    expect(parsed.isAdmin).toBe(false)
    expect(parsed.user).toBe('bob')
    await page.close()
  })

  it('an unseeded page reflects the logged-out default', async () => {
    const page = await createPage('/debug')
    const json = await page.locator('[data-test="debug-json"]').textContent()
    const parsed = JSON.parse(json!)
    expect(parsed).toEqual({ isLoggedIn: false, isAdmin: false, roles: [], user: '' })
    await page.close()
  })
})
