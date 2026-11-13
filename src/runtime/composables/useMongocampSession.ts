import { useMongocampAuth, useMongocampClientApi, useMongocampStorage } from '#imports'
import { tokenExpiryState } from '../utils/jwtExpiry'
import type { TokenExpiryState } from '../utils/jwtExpiry'
import { useMongocampProxyMode } from './useMongocampProxyMode'

// 'active'   — the token's own `exp` says the session is fine
// 'expired'  — the token itself says it has run out
// 'unknown'  — nothing can be said (unreadable token, no token, server proxy mode)
export type SessionState = 'active' | 'expired' | 'unknown'

// What the server said about the stored token: 'valid' (answered true), 'invalid' (a readable 401, or an
// explicit false) or 'unknown' (no token, server proxy mode, network failure, timeout, any other status).
export type SessionVerification = 'valid' | 'invalid' | 'unknown'

const VERIFY_TIMEOUT_MS = 15000

// Is my MongoCamp login still usable? Judged from the token's own `exp`, without a request: since server
// 1.6.1 a refused token is a readable 401, which the dependency and `MongocampErrorAlert` handle themselves.
// In server proxy mode there is no login, so none of this applies.
export function useMongocampSession() {
  const { logout } = useMongocampAuth()
  const storage = useMongocampStorage()
  const { authApi } = useMongocampClientApi()
  const isProxyMode = useMongocampProxyMode()

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

  // Asks the server (`GET /auth/authenticated`) whether the stored token is still accepted — the one thing the
  // local `exp` check cannot see: a logout (either route) invalidates the token on the server while its `exp`
  // is still in the future (verified on 1.6.3, brain/project/mongocamp-server-1-6-3-endpoints.md). Only a
  // *readable* 401 counts as invalid; a failure to get an answer is never a reason to log anyone out.
  async function verify(): Promise<SessionVerification> {
    if (isProxyMode) return 'unknown'
    const token = storage.value?.token
    if (typeof token !== 'string' || !token) return 'unknown'
    try {
      const result = await authApi.isAuthenticated({ signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) })
      if (result.value === true) return 'valid'
      return result.value === false ? 'invalid' : 'unknown'
    }
    catch (e: unknown) {
      return (e as { response?: { status?: number } } | null)?.response?.status === 401 ? 'invalid' : 'unknown'
    }
  }

  // Drops the stored session through the dependency's own logout.
  async function invalidateSession(): Promise<void> {
    if (isProxyMode) return
    await logout()
  }

  return { checkExpiry, currentState, verify, invalidateSession }
}
