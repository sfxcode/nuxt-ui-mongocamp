# useMongocampSession

Answers "is my MongoCamp login still usable?" from the token alone. A token the server refuses is a readable `401` (server 1.6.1+), which the dependency and [`MongocampErrorAlert`](/components/mongocamp-error-alert) handle themselves; this composable covers what no request has noticed yet — a token whose own `exp` has passed. Used by the opt-in [session guard](/guide/route-protection#the-session-guard-opt-in).

```ts
const {
  checkExpiry,       // () => 'expired' | 'valid' | 'unknown'   — token only, no request
  currentState,      // () => SessionState                       — token only, no request
  invalidateSession, // () => Promise<void>                      — awaits the dependency's logout()
} = useMongocampSession()
```

```ts
type SessionState = 'active' | 'expired' | 'unknown'
```

| State | Meaning |
|---|---|
| `active` | The token's own `exp` says the session is fine |
| `expired` | The token itself says it has run out |
| `unknown` | Nothing can be said: unreadable or missing token, or server proxy mode |

**`unknown` is never a reason to log anyone out.**

## `checkExpiry` and `currentState`

Read the `exp` claim of the stored token (decoded, **not verified**) with a 30 s leeway for clock skew. A token it cannot read — not a JWT, no numeric `exp` — and a missing token are `unknown`, not expired. `currentState()` is the same answer as a `SessionState` (`valid` → `active`). Neither sends a request, and the token value is never logged.

## `invalidateSession`

Clears the stored session through the dependency's own `logout()` (which blanks the token and profile in the `mongocamp-session` cookie) and awaits it. A no-op in server proxy mode.

## Server proxy mode

There is no login, token or session in [server proxy mode](/guide/server-proxy-auth): every method reports `unknown` and logs nobody out.
