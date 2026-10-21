# useMongocampSession

Answers "is my MongoCamp login still usable?". An expired or rejected token is answered with a `401` **without CORS headers**, which the browser reports like a dead network, so the answer has to be worked out: from the token's own `exp`, and — after a request failed — from whether the server answers at all. Used by the opt-in [session guard](/guide/route-protection#the-session-guard-opt-in).

```ts
const {
  checkExpiry,      // () => 'expired' | 'valid' | 'unknown'              — token only, no request
  currentState,     // () => SessionState                                  — token only, no request
  diagnoseFailure,  // () => Promise<SessionState>                         — call after a network failure
  invalidateSession, // () => Promise<void>                                — awaits the dependency's logout()
} = useMongocampSession()
```

```ts
type SessionState = 'active' | 'expired' | 'rejected' | 'unknown'
```

| State | Meaning |
|---|---|
| `active` | The token says it is still good (the server may still refuse it) |
| `expired` | The token itself says it has run out |
| `rejected` | A request failed, yet the server answers an unauthenticated probe — the session is the problem |
| `unknown` | Nothing can be said: unreadable or missing token, server unreachable, no URL, or server proxy mode |

**`unknown` is never a reason to log anyone out.**

## `checkExpiry` and `currentState`

Read the `exp` claim of the stored token (decoded, **not verified**) with a 30 s leeway for clock skew. A token it cannot read — not a JWT, no numeric `exp` — and a missing token are `unknown`, not expired. `currentState()` is the same answer as a `SessionState` (`valid` → `active`). Neither sends a request, and the token value is never logged.

## `diagnoseFailure`

Call it after a request failed with a network error. It answers:

1. `expired` straight away when the token has visibly expired — no request.
2. `unknown` when there is no token, no MongoCamp URL, or in server proxy mode — no request.
3. Otherwise it asks the server with one **unauthenticated** `GET <mongocamp.url>/version` (no credentials, no custom headers, 5 s timeout): an answer means the server is up while our calls fail, so `rejected`; no answer (or an HTTP error) means `unknown` — a down server is not a dead session.

The probe is shared by the whole app and rate-limited: at most one request in flight, and the last answer — failures included — is reused for 5 seconds, so a burst of failing requests produces one probe.

`rejected` means "the server answers but our calls fail". A request the server refuses for another reason — for example a filter it cannot parse, see [`MongocampCollectionData`](/components/mongocamp-collection-data) — looks the same to the browser, so don't log the user out on `rejected` alone.

## `invalidateSession`

Clears the stored session through the dependency's own `logout()` (which blanks the token and profile in the `mongocamp-session` cookie) and awaits it. A no-op in server proxy mode.

## Server proxy mode

There is no login, token or session in [server proxy mode](/guide/server-proxy-auth): every method reports `unknown`, sends no request and logs nobody out.
