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
| **Readable 401 handling** | nothing (always on) | A `401` clears the session and the alert offers **Log in again** — except a `401` that only means "no grant for this" (`user not authorized for …`), which is turned into a `403`: the user stays logged in and sees "you do not have permission" |
| **Session guard** | `sessionGuard: true` | Looks at the token's own expiry on every navigation and clears a session that says it has run out |

| **Server check** | `sessionGuard: true` + `sessionGuardVerify: true` | Also asks the server whether a token that looks valid is still accepted |

None of these does anything in [server proxy mode](/guide/server-proxy-auth): there is no login, token or session there.

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

The guard only knows what the token says about itself. A token the server revoked or stopped accepting shows up as a `401` on the next request instead, which is handled as described above — unless you turn on the [server check](#server-check-opt-in).

### Server check (opt-in)

```ts
nuxtUiMongocamp: {
  sessionGuard: true,
  sessionGuardVerify: true,   // default: false, needs sessionGuard
}
```

The `exp` check cannot see a token the server has stopped accepting — a logout invalidates the token on the server while its `exp` is still hours away. With `sessionGuardVerify` the guard also calls `GET /auth/authenticated` for a token that looks valid. A **readable 401** clears the session exactly like an expired token (and redirects only if the route needs a login); a network failure, timeout or any other answer changes nothing. The cost is one request per navigation, but at most once per 30 seconds for the same token, and only in the browser — so on a hard page load a server-rendered page may show briefly before the check clears the session and redirects. Without `sessionGuard` the option does nothing (build-time warning), and it has no effect in server proxy mode.

### Log in again

**Log in again** clears the stored session first and only then navigates to `loginPath`. Clearing first matters: while the cookie still holds the dead token the app believes it is logged in, and a login page that redirects logged-in users would send the user straight back.

## Related

- [Route Protection](/guide/route-protection) — `useGlobalAuthMiddleware`, `notAllowedPath`, `logoutPath`
- [Configuration](/guide/configuration) — all module options
- [`useMongocampSession`](/composables/use-mongocamp-session)
- [`MongocampErrorAlert`](/components/mongocamp-error-alert)
