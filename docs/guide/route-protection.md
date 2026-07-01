# Route Protection

The module registers a global route middleware (`global-auth`) at startup:

| Path pattern | Requirement | Redirect if unmet |
|---|---|---|
| `/secured/**` | User must be logged in | `/` |
| `/admin/**` or `/secured/admin/**` | User must be logged in **and** hold the admin role | `/secured` |
| `/logout` | — | Calls `logout()`, then redirects to `/` |

```ts
addRouteMiddleware('global-auth', (to) => {
  if ((to.path.startsWith('/admin') || to.path.startsWith('/secured/admin'))
    && (!isLoggedIn.value || !state.value.profile.isAdmin)) {
    return navigateTo('/secured')
  }
  else if (to.path.startsWith('/secured') && !isLoggedIn.value) {
    return navigateTo('/')
  }
  else if (to.path === '/logout') {
    logout()
    return navigateTo('/')
  }
}, { global: true })
```

## Structuring your pages

Because the middleware matches on path prefix, put anything that requires a logged-in user under `pages/secured/`, and anything admin-only under `pages/secured/admin/` (or top-level `pages/admin/`):

```
pages/
├── index.vue                     # public — login page
├── secured/
│   ├── index.vue                 # dashboard — logged-in users
│   └── admin/
│       ├── users.vue             # admin only
│       ├── roles.vue             # admin only
│       └── collections/
│           ├── index.vue
│           └── [collection_name]/
│               ├── index.vue
│               └── data.vue
└── logout.vue                    # triggers logout, no UI needed
```

## Checking auth state manually

`@sfxcode/nuxt-mongocamp-server` exposes `useMongocampAuth()` for imperative checks (e.g. conditionally rendering a nav link):

```ts
const { isLoggedIn, login, logout } = useMongocampAuth()
```
