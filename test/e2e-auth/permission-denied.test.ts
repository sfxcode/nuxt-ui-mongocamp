import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, createPage, url } from '@nuxt/test-utils/e2e'
import type { Page } from '@playwright/test'
import { fakeJwt, hasSessionToken, seedSession } from '../fixtures/auth/e2e-helpers'

// The server answers a missing grant with HTTP 401 (code 4011, "user not authorized for …"); the dependency clears the
// stored session on any 401. The module turns that one 401 into a 403 before the dependency sees it, so a non-admin user
// who runs into a forbidden request stays logged in. A really dead token (the same code, plain message) still logs out.

const profile = { user: 'carol', isAdmin: false, roles: [] }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const SERVER = 'http://localhost:9999/**'

// every request to the (dummy) MongoCamp server is stubbed: the session check answers true, the collection list answers `refusal`
async function stubServer(page: Page, refusal: { code: number, msg: string }) {
  await page.route(SERVER, (route) => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (path === '/auth/authenticated') return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{"value":true}' })
    if (path === '/mongodb/collections') return route.fulfill({ status: 401, headers: cors, contentType: 'application/json', body: JSON.stringify({ ...refusal, additionalInfo: '' }) })
    return route.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{}' })
  })
}

async function requestAndRead(page: Page): Promise<string> {
  await page.goto(url('/secured/request'))
  await page.click('[data-test="request"]')
  await page.waitForFunction(() => document.querySelector('[data-test="outcome"]')?.textContent?.trim() !== 'idle')
  return (await page.textContent('[data-test="outcome"]'))!.trim()
}

describe('a missing grant is not a dead session', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/auth', import.meta.url)),
  })

  it('a 401 "not authorized for collection" reaches the app as a 403 and the user stays logged in', async () => {
    const page = await createPage()
    await stubServer(page, { code: 4011, msg: 'user not authorized for collection' })
    await seedSession(page, { token: fakeJwt(3600), profile })

    expect(await requestAndRead(page)).toBe('failed:403')

    expect(await hasSessionToken(page)).toBe(true)
    expect(page.url()).toContain('/secured/request')
    await page.close()
  })

  it('an admin-only endpoint ("not authorized for request") is the same: forbidden, still logged in', async () => {
    const page = await createPage()
    await stubServer(page, { code: 4011, msg: 'user not authorized for request' })
    await seedSession(page, { token: fakeJwt(3600), profile })

    expect(await requestAndRead(page)).toBe('failed:403')

    expect(await hasSessionToken(page)).toBe(true)
    await page.close()
  })

  it('a dead token (401, plain "user not authorized") is still a 401 and still clears the session', async () => {
    const page = await createPage()
    await stubServer(page, { code: 4011, msg: 'user not authorized' })
    await seedSession(page, { token: fakeJwt(3600), profile })

    expect(await requestAndRead(page)).toBe('failed:401')

    await expect.poll(() => hasSessionToken(page)).toBe(false)
    await page.close()
  })
})
