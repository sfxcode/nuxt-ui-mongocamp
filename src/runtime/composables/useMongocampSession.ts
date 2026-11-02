import { useRuntimeConfig } from '#app'
import { useMongocampAuth, useMongocampStorage } from '#imports'
import { tokenExpiryState } from '../utils/jwtExpiry'
import type { TokenExpiryState } from '../utils/jwtExpiry'

// 'active'   — the token's own `exp` says the session is fine
// 'expired'  — the token itself says it has run out
// 'unknown'  — nothing can be said (unreadable token, no token, server proxy mode)
export type SessionState = 'active' | 'expired' | 'unknown'

// Is my MongoCamp login still usable? Judged from the token's own `exp`, without a request: since server
// 1.6.1 a refused token is a readable 401, which the dependency and `MongocampErrorAlert` handle themselves.
// In server proxy mode there is no login, so none of this applies.
export function useMongocampSession() {
  const config = useRuntimeConfig()
  const { logout } = useMongocampAuth()
  const storage = useMongocampStorage()
  const isProxyMode = config.public.nuxtUiMongocampOptions?.useServerProxy ?? false

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

  // Drops the stored session through the dependency's own logout.
  async function invalidateSession(): Promise<void> {
    if (isProxyMode) return
    await logout()
  }

  return { checkExpiry, currentState, invalidateSession }
}
