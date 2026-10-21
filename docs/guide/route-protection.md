# Route Protection

Route protection is **opt-in** and **config-driven**, backed by the [`useMongocampRoles`](/composables/use-mongocamp-roles) composable. Nothing is protected until you set `useGlobalAuthMiddleware: true` and list your app's protected route patterns under `nuxtUiMongocamp` (see [Configuration](/guide/configuration)).

```ts
export default defineNuxtConfig({
  nuxtUiMongocamp: {
    useGlobalAuthMiddleware: true,
    notAllowedPath: '/login',                     // default '/'
    logoutRedirectPath: '/',                       // default '/'
    logoutPath: '/logout',                         // default '/logout'
    managerRoles: ['support'],
    securedRouteParts: ['/secured/**'],
    managementRouteParts: ['/secured/manage/**'],
    adminRouteParts: ['/secured/admin/**'],
  },
})
```

## How the middleware decides

When `useGlobalAuthMiddleware` is `true`, the module registers a global `global-auth` route middleware. On every navigation:

| Path pattern | Requirement | If not met |
|---|---|---|
| `logoutPath` (default `/logout`) | — | Calls `logout()`, then redirects to `logoutRedirectPath` |
| Matches `securedRouteParts` | Logged in | Redirects to `notAllowedPath` |
| Matches `managementRouteParts` | Manager (see below) | Redirects to `notAllowedPath` |
| Matches `adminRouteParts` | Admin | Redirects to `notAllowedPath` |
| Anything else | — | Allowed |

A route can match more than one pattern set — e.g. `/secured/admin/**` is also covered by `/secured/**`. Checks run in the order above and the **first** one that fails wins, so a logged-out user hitting an admin route is redirected for being logged out, not for lacking the admin role.

`notAllowedPath` and `logoutRedirectPath` are always allowed by the middleware, regardless of whether either also matches one of the patterns above — otherwise a redirect target that happened to fall under a protected pattern (or a broad `securedRouteParts: ['/**']`) would redirect to itself forever. They're separate options (both defaulting to `'/'`) so a deliberate logout can land somewhere different from an auth-failure redirect — e.g. back to the home page instead of the login page.

Route parts are glob patterns matched with [`minimatch`](https://www.npmjs.com/package/minimatch), not plain string prefixes. `/secured/admin/**` matches nested pages like `/secured/admin/users`, and also matches `/secured/admin` itself (the directory's own `index.vue`) — the composable tries the route with a trailing slash appended so a directory's index page is covered by its own `/**` pattern.

## Not a security boundary, and no SSR support

This middleware is **UI-level gating**, not access control — it only decides which pages render, not which data is reachable. Actual data access is still protected server-side by MongoCamp's own tokens/api key, independently of this middleware.

Login state lives in the `mongocamp-session` **cookie** (`{ token, profile }`, 30 days by default, shared by every tab of the same origin), which the browser sends with each request. Older versions of the underlying `@sfxcode/nuxt-mongocamp-server` kept it in `sessionStorage`, which server-side rendering can never see — if you are on such a version, an SSR app evaluates `isLoggedIn` as `false` on every server-rendered request and redirects logged-in users on a hard refresh. With the cookie, SSR can in principle read the session, but this module's own tests and playground all run with `ssr: false`, so `useGlobalAuthMiddleware` is not verified against an SSR app.

## A stale session looks logged in

The session token is a JWT valid for 6 hours on a stock MongoCamp server, and the browser refreshes it every `tokenRefreshInterval` only while a page of your app is open. If the token expires (or the server stops accepting it) while no page is open, the cookie — and therefore `isLoggedIn` — stays in place, so the app *looks* logged in while every request fails. The client library clears the session on a `401` response, but when your app and the MongoCamp server are on different origins and the server's `401` carries no CORS headers, the browser reports a plain network error instead and that safety net never runs. Components show this as "The server could not be reached, or your session has expired"; logging out and in again fixes it. Adding CORS headers to authentication failures on the MongoCamp server (or serving both from one origin) lets the client see the `401` and clear the session itself.

### The session guard (opt-in)

Set `sessionGuard: true` (and `loginPath`, e.g. `'/login'`) to stop the app from *looking* logged in after the token has run out. It registers a global `session-guard` route middleware, ahead of `global-auth`, that on every navigation (the first one included) reads the token's `exp` claim — it is **decoded, not verified**; the server stays the only authority — and:

| Token | What happens |
|---|---|
| Not expired | Nothing |
| Unreadable (not a JWT, no `exp`, ...) or missing | Nothing — an unknown state never logs anyone out |
| Expired (more than 30 s past `exp`, to forgive clock skew) | The session is cleared through `logout()`. If the route asked for is no longer reachable without a login, the user is sent to `loginPath`; a public page stays where it is |

`loginPath` is always allowed — like `notAllowedPath` and `logoutRedirectPath` — and the guard never redirects away from it, so it cannot loop. It only looks at the token itself, so it cannot notice a token the server stopped accepting; that case is for the failed-request diagnosis in [`useMongocampSession`](/composables/use-mongocamp-session). In [server proxy mode](/guide/server-proxy-auth) there is no login, so the guard is not registered (a build-time warning fires if both options are on).

## Manager vs. admin

- **Admin** — `useMongocampStorage().value.profile.isAdmin`, set by the MongoCamp server on login.
- **Manager** — the logged-in profile's `roles` includes at least one entry from `managerRoles`, **or** the user is an admin. An admin always satisfies a management-gated route, even with no matching role.

## Structuring your pages

Match your `nuxt.config.ts` route-part globs to your actual page structure. For example, to mirror the playground's layout:

```
pages/
├── index.vue                     # public — login page
├── secured/
│   ├── index.vue                 # dashboard — any logged-in user
│   ├── account.vue                # any logged-in user
│   ├── manager/
│   │   └── index.vue             # manager (or admin) only
│   └── admin/
│       ├── users/
│       ├── roles/
│       ├── collections/
│       ├── jobs/
│       └── databases/
└── logout.vue                    # triggers logout, no UI needed
```

```ts
nuxtUiMongocamp: {
  useGlobalAuthMiddleware: true,
  securedRouteParts: ['/secured/**'],
  managementRouteParts: ['/secured/manager/**'],
  adminRouteParts: ['/secured/admin/**'],
},
```

## Checking auth/role state in components

`@sfxcode/nuxt-mongocamp-server`'s `useMongocampAuth()` exposes raw login state (`isLoggedIn`, `login`, `logout`); this module's [`useMongocampRoles`](/composables/use-mongocamp-roles) adds `isAdmin`/`isManager`/`isAllowedPathForRoute` on top — the same composable the middleware itself uses. Use it to conditionally render navigation, exactly like the playground's `default.vue` layout does:

```ts
const { isAdmin, isManager } = useMongocampRoles()
```
