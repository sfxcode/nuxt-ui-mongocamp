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
