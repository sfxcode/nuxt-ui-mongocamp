import { useRuntimeConfig } from '#app'
import { useMongocampAuth, useMongocampStorage } from '#imports'
import { tokenExpiryState } from '../utils/jwtExpiry'
import type { TokenExpiryState } from '../utils/jwtExpiry'
import { createServerProbe } from '../utils/serverProbe'

// 'active'   — the token says it is still good (the server may still refuse it)
// 'expired'  — the token itself says it has run out
// 'rejected' — a request failed, yet the server answers an unauthenticated probe: the session is the problem
// 'unknown'  — nothing can be said (unreadable token, no token, server unreachable, server proxy mode)
export type SessionState = 'active' | 'expired' | 'rejected' | 'unknown'

// One probe for the whole app: its single-flight and cooldown only mean something when shared.
let probe: ReturnType<typeof createServerProbe> | undefined

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

  // Call after a request failed with a network error. Costs at most one unauthenticated `GET /version`,
  // shared and rate-limited, and none at all when the token has visibly expired or when there is no token.
  async function diagnoseFailure(): Promise<SessionState> {
    const expiry = checkExpiry()
    if (expiry === 'expired') return 'expired'
    if (isProxyMode || !storage.value?.token) return 'unknown'
    return (await probe!()) === 'reachable' ? 'rejected' : 'unknown'
  }

  // Drops the stored session through the dependency's own logout.
  async function invalidateSession(): Promise<void> {
    if (isProxyMode) return
    await logout()
  }

  return { checkExpiry, currentState, diagnoseFailure, invalidateSession }
}
