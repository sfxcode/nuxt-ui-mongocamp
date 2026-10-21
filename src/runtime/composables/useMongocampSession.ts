import { useRuntimeConfig } from '#app'
import { useMongocampAuth, useMongocampClientApi, useMongocampStorage } from '#imports'
import { tokenExpiryState } from '../utils/jwtExpiry'
import type { TokenExpiryState } from '../utils/jwtExpiry'
import { createServerProbe } from '../utils/serverProbe'
import { createThrottled } from '../utils/throttled'

// 'active'   — the session is fine: from the token alone (`currentState`), or — after a failed request
//              (`diagnoseFailure`) — the server answers and accepts the token, so the request itself was refused
// 'expired'  — the token itself says it has run out
// 'rejected' — the server answers, but refuses our token: the session has ended
// 'unknown'  — nothing can be said (unreadable token, no token, server unreachable, server proxy mode)
export type SessionState = 'active' | 'expired' | 'rejected' | 'unknown'

// One probe and one token check for the whole app: single-flight and cooldown only mean something when shared.
let probe: ReturnType<typeof createServerProbe> | undefined
let tokenAccepted: (() => Promise<boolean>) | undefined
let authApi: ReturnType<typeof useMongocampClientApi>['authApi'] | undefined

const TOKEN_CHECK_TIMEOUT_MS = 5000

// Is my MongoCamp login still usable? An expired or rejected token is answered with a 401 without CORS
// headers, which the browser reports like a dead network (brain/project/mongocamp-session-behavior.md), so
// the answer has to be worked out: from the token's own `exp`, and — after a request failed — from whether
// the server answers at all. In server proxy mode there is no login, so none of this applies.
export function useMongocampSession() {
  const config = useRuntimeConfig()
  const { logout } = useMongocampAuth()
  const storage = useMongocampStorage()
  const isProxyMode = config.public.nuxtUiMongocampOptions?.useServerProxy ?? false

  probe ??= createServerProbe({ getUrl: () => (config.public.mongocamp as { url?: string } | undefined)?.url })
  // `GET /auth/authenticated` answers `{ value: true }` readably for a good token; a bad or missing token is
  // a 401 without CORS headers, i.e. a network error — so success vs. failure is the answer.
  if (!isProxyMode) authApi = useMongocampClientApi().authApi
  tokenAccepted ??= createThrottled(async () => {
    try {
      return (await authApi!.isAuthenticated({ signal: AbortSignal.timeout(TOKEN_CHECK_TIMEOUT_MS) })).value === true
    }
    catch {
      return false
    }
  })

  // From the token alone — no request. 'unknown' is never a reason to log anyone out.
  function checkExpiry(): TokenExpiryState {
    if (isProxyMode) return 'unknown'
    const token = storage.value?.token
    return typeof token === 'string' && token ? tokenExpiryState(token) : 'unknown'
  }

  function currentState(): SessionState {
    const expiry = checkExpiry()
    return expiry === 'valid' ? 'active' : expiry
  }

  // Call after a request failed with a network error. At most two shared, rate-limited requests, none at
  // all when the token has visibly expired or there is no token: an unauthenticated `GET /version` (is the
  // server up?) and then `GET /auth/authenticated` (does it accept our token?).
  //   server silent                      -> 'unknown'  (a down server is not a dead session)
  //   server up, token refused           -> 'rejected' (the session has ended)
  //   server up, token accepted          -> 'active'   (the failed request was refused for its own reasons,
  //                                                     e.g. a filter the server cannot parse)
  async function diagnoseFailure(): Promise<SessionState> {
    const expiry = checkExpiry()
    if (expiry === 'expired') return 'expired'
    if (isProxyMode || !storage.value?.token) return 'unknown'
    if (await probe!() !== 'reachable') return 'unknown'
    return (await tokenAccepted!()) ? 'active' : 'rejected'
  }

  // Drops the stored session through the dependency's own logout.
  async function invalidateSession(): Promise<void> {
    if (isProxyMode) return
    await logout()
  }

  return { checkExpiry, currentState, diagnoseFailure, invalidateSession }
}
