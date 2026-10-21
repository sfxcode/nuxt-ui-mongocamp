# Session Handling

A MongoCamp login is a JWT stored in the `mongocamp-session` cookie. This page explains how the module copes with a session that is no longer usable, what you can switch on, and what only the server can fix.

## The problem: a dead session looks like a dead network

The token is valid for 6 hours on a stock MongoCamp server, and the browser only refreshes it while a page of your app is open. When it expires — or the server stops accepting it — the cookie stays, so the app still looks logged in while every request fails. The server answers such a request with a `401` that carries **no CORS headers** when your app and the server are on different origins, so the browser does not let the client see the `401` and reports a plain network error instead. The client library's own safety net ("any `401` clears the session") never runs, and from the outside the failure is indistinguishable from the server being down or from the server refusing one particular request (for example a filter it cannot parse).

## What the module does about it

Two independent mechanisms, one opt-in and one automatic:

| Mechanism | Needs | What it does |
|---|---|---|
| **Session guard** | `sessionGuard: true` | Looks at the token's own expiry on every navigation and clears a session that says it has run out |
| **Failure diagnosis** | nothing (always on) | After a request fails with a network error, works out whether the session ended, the server refused the request, or nothing can be said |

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

The guard only knows what the token says about itself. It cannot notice a token the server revoked or stopped accepting — that is what the diagnosis is for.

### Failure diagnosis

[`MongocampErrorAlert`](/components/mongocamp-error-alert), which every list component uses, asks [`useMongocampSession().diagnoseFailure()`](/composables/use-mongocamp-session) when a load fails with a network error:

1. Token expired → the session ended (no request needed).
2. Otherwise one unauthenticated `GET /version` — if the server does not answer, nothing can be said (a down server is not a dead session).
3. If it answers, `GET /auth/authenticated` with the token. A good token gets a readable `{ "value": true }`; a refused one fails like any other `401`. So an answer means the server accepts the session and **refused only this request**, a failure means the **session ended**.

The alert then says so: "Your session has expired" with a **Log in again** button, "the server is reachable and your session is valid, but it refused this request" with Retry, or — when it cannot tell — the plain "could not be reached, or your session has expired". Both requests are shared and rate-limited (one in flight, answers reused for 5 seconds), so a page full of failing requests costs one probe and one token check.

**Log in again** clears the stored session first and only then navigates to `loginPath`. Clearing first matters: while the cookie still holds the dead token the app believes it is logged in, and a login page that redirects logged-in users would send the user straight back.

## What only the server can fix

Adding CORS headers to authentication failures (`401`/`403`) on the MongoCamp server — or serving the app and the server from one origin — lets the client library see the `401` itself and clear the session on its own, which makes most of the guesswork above unnecessary. This module cannot change that; the diagnosis and the guard are the best it can do from the browser.

## Related

- [Route Protection](/guide/route-protection) — `useGlobalAuthMiddleware`, `notAllowedPath`, `logoutPath`
- [Configuration](/guide/configuration) — all module options
- [`useMongocampSession`](/composables/use-mongocamp-session)
- [`MongocampErrorAlert`](/components/mongocamp-error-alert)
