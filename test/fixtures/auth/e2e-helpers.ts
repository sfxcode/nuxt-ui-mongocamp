import type { Page } from '@playwright/test'

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
 * Seeds sessionStorage with a fake login session, matching the exact shape/key
 * `useMongocampStorage()` (`useSessionStorage('mongocamp', { token, profile })`) reads.
 *
 * MUST be called BEFORE the first `page.goto()`/`createPage()` navigation for this `page` —
 * `addInitScript` only affects loads that happen *after* it's registered, so calling this
 * after the page has already navigated silently no-ops (no error, the seed just never applies).
 */
export async function seedSession(page: Page, session: FakeSession): Promise<void> {
  const serialized = JSON.stringify(session)
  await page.addInitScript((value) => {
    window.sessionStorage.setItem('mongocamp', value)
  }, serialized)
}
