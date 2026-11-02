# Session Handling

A MongoCamp login is a JWT stored in the `mongocamp-session` cookie. This page explains how the module copes with a session that is no longer usable, what you can switch on, and what only the server can fix.

## How a dead session shows up

A MongoCamp login lasts 6 hours on a stock server, and the browser only refreshes the token while a page of your app is open. When it expires — or the server stops accepting it — the cookie stays, so the app still looks logged in while every request fails. MongoCamp server 1.6.1 and later (this module needs 1.6.3+) answers such a request with a readable `401` (CORS headers included), so:

- the client library clears the session by itself, and
- [`MongocampErrorAlert`](/components/mongocamp-error-alert) shows "Your session has expired" with a **Log in again** button.

What is left is a token that expired while no request was made. The session guard covers that without a request.

## What the module does about it

| Mechanism | Needs | What it does |
|---|---|---|
| **Readable 401 handling** | nothing (always on) | A `401` clears the session and the alert offers **Log in again** |
| **Session guard** | `sessionGuard: true` | Looks at the token's own expiry on every navigation and clears a session that says it has run out |

Neither does anything in [server proxy mode](/guide/server-proxy-auth): there is no login, token or session there.

### Session guard

```ts
export default defineNuxtConfig({
  nuxtUiMongocamp: {
    sessionGuard: true,    // default: false
    loginPath: '/login',   // default: '/'
  },
})
```

A global `session-guard` route middleware, registered ahead of the [route-protection](/guide/route-protection#the-session-guard-opt-in) middleware, reads the stored token's `exp` claim — decoded, **not verified**; the server stays the only authority — with 30 seconds of leeway for clock skew. A token that has expired is cleared through `logout()` on any route; the user is sent to `loginPath` only if the route they asked for needs a login, so a public page stays public. A token it cannot read (not a JWT, no `exp`) or no token at all does nothing: an unknown state never logs anyone out. `loginPath` is always allowed and the guard never redirects away from it, so it cannot loop.

The guard only knows what the token says about itself. A token the server revoked or stopped accepting shows up as a `401` on the next request instead, which is handled as described above.

### Log in again

**Log in again** clears the stored session first and only then navigates to `loginPath`. Clearing first matters: while the cookie still holds the dead token the app believes it is logged in, and a login page that redirects logged-in users would send the user straight back.

## Related

- [Route Protection](/guide/route-protection) — `useGlobalAuthMiddleware`, `notAllowedPath`, `logoutPath`
- [Configuration](/guide/configuration) — all module options
- [`useMongocampSession`](/composables/use-mongocamp-session)
- [`MongocampErrorAlert`](/components/mongocamp-error-alert)
