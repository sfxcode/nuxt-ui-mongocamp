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

Login state lives in `sessionStorage`, which server-side rendering never sees. If your app runs with SSR enabled, the middleware evaluates `isLoggedIn` as `false` on every server-rendered request — including a hard refresh of a secured page by an already-logged-in user, who gets redirected to `notAllowedPath` even though they're still logged in. The playground and this module's own test fixtures all run with `ssr: false` for this reason; `useGlobalAuthMiddleware` is not currently verified against an SSR app.

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
