import type { TokenExpiryState } from './jwtExpiry'

interface SessionGuardDeps {
  path: string
  loginPath: string
  checkExpiry: () => TokenExpiryState
  invalidate: () => Promise<void>
  // asked *after* the session has been cleared: is this route reachable without a login?
  isAllowed: (path: string) => boolean
}

// What the `session-guard` route middleware decides for one navigation. A token that says it has
// expired is cleared on any route (the app must not keep looking logged in); the user is only sent to
// the login path when the route they asked for is no longer reachable without a session — a public page
// stays public. The login path is never redirected away from, so this cannot loop. Anything other than
// an explicit "expired" (valid, or unreadable) does nothing at all.
export async function runSessionGuard(deps: SessionGuardDeps): Promise<'continue' | 'redirect'> {
  if (deps.checkExpiry() !== 'expired') return 'continue'
  try {
    await deps.invalidate()
  }
  catch {
    // a failed clear leaves things as they were; do not strand the user in a redirect on top of it
    return 'continue'
  }
  if (deps.path === deps.loginPath) return 'continue'
  return deps.isAllowed(deps.path) ? 'continue' : 'redirect'
}
