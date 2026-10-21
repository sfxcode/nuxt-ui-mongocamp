import type { Page } from '@playwright/test'
import { url } from '@nuxt/test-utils/e2e'

export interface FakeSession {
  token: string
  profile: {
    user: string
    isAdmin: boolean
    roles?: string[]
    apiKey?: string
    grants?: unknown[]
  }
}

/**
 * Seeds the `mongocamp-session` cookie with a fake login session, matching the exact name/shape
 * `useMongocampStorage()` (`useCookie('mongocamp-session', ...)`) reads. A cookie — unlike the
 * `sessionStorage` the dependency used before — reaches the server too, so SSR sees the session.
 *
 * Call it before the first `page.goto()` so the very first request already carries the cookie.
 */
export async function seedSession(page: Page, session: FakeSession): Promise<void> {
  await page.context().addCookies([{
    name: 'mongocamp-session',
    value: encodeURIComponent(JSON.stringify(session)),
    url: url('/'),
  }])
}

/**
 * A JWT-shaped token carrying only an `exp` claim (seconds from now; negative = already expired). The
 * signature is junk: the module reads `exp` without verifying anything, and the fixture never reaches a
 * real MongoCamp server.
 */
export function fakeJwt(expiresInSeconds: number): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds, user: 'carol' })}.signature`
}

/**
 * Whether the stored session still carries a token. The dependency's `logout()` does not delete the
 * `mongocamp-session` cookie: it blanks `token` and the profile, so "logged out" means an empty token.
 */
export async function hasSessionToken(page: Page): Promise<boolean> {
  const cookie = (await page.context().cookies()).find(c => c.name === 'mongocamp-session')
  if (!cookie) return false
  try {
    const session = JSON.parse(decodeURIComponent(cookie.value)) as { token?: unknown }
    return typeof session.token === 'string' && session.token.length > 0
  }
  catch {
    return false
  }
}
