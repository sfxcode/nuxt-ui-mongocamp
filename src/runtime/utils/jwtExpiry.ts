// Reads the `exp` claim of a JWT *without verifying it* — the server is the only authority on whether a
// token is accepted; this only answers "does the token say it has run out?". Everything unreadable
// (malformed token, missing or odd `exp`) is reported as unknown, never as expired, so that a token this
// code cannot understand can never log anybody out. The token itself is never logged or returned.

export type TokenExpiryState = 'expired' | 'valid' | 'unknown'

// Clock skew between this browser and the server: a token is only called expired once it is this far past `exp`.
const DEFAULT_LEEWAY_SECONDS = 30

function decodeBase64Url(segment: string): string | null {
  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4))
    return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)))
  }
  catch {
    return null
  }
}

// `exp` in seconds since the epoch, or null when the token does not carry a usable one.
export function getTokenExpiry(token: string): number | null {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const json = decodeBase64Url(parts[1]!)
  if (json === null) return null
  let payload: unknown
  try {
    payload = JSON.parse(json)
  }
  catch {
    return null
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
  const exp = (payload as { exp?: unknown }).exp
  return typeof exp === 'number' && Number.isFinite(exp) && exp > 0 ? exp : null
}

export function tokenExpiryState(token: string, nowMs: number = Date.now(), leewaySeconds: number = DEFAULT_LEEWAY_SECONDS): TokenExpiryState {
  const exp = getTokenExpiry(token)
  if (exp === null) return 'unknown'
  return nowMs / 1000 > exp + leewaySeconds ? 'expired' : 'valid'
}
