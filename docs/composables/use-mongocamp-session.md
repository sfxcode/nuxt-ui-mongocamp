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
| `active` | The session is fine: by the token alone (`currentState`), or — after a failed request — the server answers and accepts the token, so the request itself was refused |
| `expired` | The token itself says it has run out |
| `rejected` | The server answers, but refuses our token — the session has ended |
| `unknown` | Nothing can be said: unreadable or missing token, server unreachable, no URL, or server proxy mode |

**`unknown` is never a reason to log anyone out.**

## `checkExpiry` and `currentState`

Read the `exp` claim of the stored token (decoded, **not verified**) with a 30 s leeway for clock skew. A token it cannot read — not a JWT, no numeric `exp` — and a missing token are `unknown`, not expired. `currentState()` is the same answer as a `SessionState` (`valid` → `active`). Neither sends a request, and the token value is never logged.

## `diagnoseFailure`

Call it after a request failed with a network error. It answers:

1. `expired` straight away when the token has visibly expired — no request.
2. `unknown` when there is no token, no MongoCamp URL, or in server proxy mode — no request.
3. Otherwise it asks the server with one **unauthenticated** `GET <mongocamp.url>/version` (no credentials, no custom headers, 5 s timeout). No answer (or an HTTP error) means `unknown` — a down server is not a dead session.
4. If the server is up, it asks `GET /auth/authenticated` with the session's token (5 s timeout). That endpoint answers `{ "value": true }` readably for a good token, while a refused token is a `401` without CORS headers, i.e. a network error. So an answer means `active` — the request that failed was refused for its own reasons, such as a filter the server cannot parse (see [`MongocampCollectionData`](/components/mongocamp-collection-data)) — and a failure means `rejected`.

Both requests are shared by the whole app and rate-limited: at most one in flight each, and the last answer — failures included — is reused for 5 seconds, so a burst of failing requests produces one probe and one token check.

## `invalidateSession`

Clears the stored session through the dependency's own `logout()` (which blanks the token and profile in the `mongocamp-session` cookie) and awaits it. A no-op in server proxy mode.

## Server proxy mode

There is no login, token or session in [server proxy mode](/guide/server-proxy-auth): every method reports `unknown`, sends no request and logs nobody out.
