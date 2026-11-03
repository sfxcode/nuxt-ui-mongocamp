import type { TokenExpiryState } from './jwtExpiry'

export type VerifyResult = 'valid' | 'invalid' | 'unknown'

interface SessionGuardDeps {
  path: string
  loginPath: string
  checkExpiry: () => TokenExpiryState
  invalidate: () => Promise<void>
  // optional server check of a token that still looks fine locally; absent ⇒ only the `exp` check runs
  verify?: () => Promise<VerifyResult>
  // asked *after* the session has been cleared: is this route reachable without a login?
  isAllowed: (path: string) => boolean
}

// What the `session-guard` route middleware decides for one navigation. A token that says it has
// expired is cleared on any route (the app must not keep looking logged in); the user is only sent to
// the login path when the route they asked for is no longer reachable without a session — a public page
// stays public. The login path is never redirected away from, so this cannot loop. Anything other than
// an explicit "expired" (valid, or unreadable) does nothing at all — except that, when a `verify` is given,
// a token that looks valid is also cleared if the server explicitly says it is no longer accepted. A
// `verify` that throws or answers 'unknown' changes nothing.
export async function runSessionGuard(deps: SessionGuardDeps): Promise<'continue' | 'redirect'> {
  const expiry = deps.checkExpiry()
  if (expiry !== 'expired' && !(expiry === 'valid' && deps.verify && await isRejectedByServer(deps.verify))) return 'continue'
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

async function isRejectedByServer(verify: () => Promise<VerifyResult>): Promise<boolean> {
  try {
    return (await verify()) === 'invalid'
  }
  catch {
    return false
  }
}

// Remembers that a token was just accepted, so the server check is not repeated on every navigation.
// Only 'valid' is cached; the key is the token itself, so a new login is always checked afresh. Keep one per
// app instance, on the client — never in module scope on the server, where it would be shared by requests.
export function createVerifyCache(ttlMs: number, now: () => number = Date.now) {
  let last: { key: string, at: number } | null = null
  return async function cached(key: string, run: () => Promise<VerifyResult>): Promise<VerifyResult> {
    if (last && last.key === key && now() - last.at < ttlMs) return 'valid'
    const result = await run()
    last = result === 'valid' ? { key, at: now() } : null
    return result
  }
}
