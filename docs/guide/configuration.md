# Configuration

## Module options

The module's own config key is `nuxtUiMongocamp` — it configures the global auth/role middleware (see [Route Protection](/guide/route-protection) for the full behavior):

```ts
export default defineNuxtConfig({
  modules: ['nuxt-ui-mongocamp'],

  nuxtUiMongocamp: {
    useGlobalAuthMiddleware: true,                  // default: false
    notAllowedPath: '/login',                       // default: '/'
    logoutRedirectPath: '/',                         // default: '/'
    logoutPath: '/logout',                          // default: '/logout'
    sessionGuard: true,                             // default: false
    loginPath: '/login',                            // default: '/'
    managerRoles: ['support'],                      // default: []
    securedRouteParts: ['/secured/**'],              // default: []
    managementRouteParts: ['/secured/manage/**'],    // default: []
    adminRouteParts: ['/secured/admin/**'],          // default: []
    useServerProxy: false,                          // default: false
    serverProxyPath: '/api/_mongocamp',             // default shown
    formkitStyles: true,                            // default: true
    paths: { collections: '/db/collections' },      // default: '/secured/admin/...' — see below
  },
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `useGlobalAuthMiddleware` | `boolean` | `false` | Registers the global `global-auth` route middleware. Opt-in — nothing is protected unless this is `true`. |
| `notAllowedPath` | `string` | `'/'` | Where the middleware redirects on any disallowed route. Always treated as allowed by the middleware itself, so it can never cause a redirect loop — set it to e.g. `'/login'` for apps that gate everything behind a login page. |
| `logoutRedirectPath` | `string` | `'/'` | Where the middleware redirects after `/logout`. A separate option from `notAllowedPath`, also always treated as allowed — so a deliberate logout can land somewhere different from an auth-failure redirect (e.g. the home page instead of the login page). |
| `logoutPath` | `string` | `'/logout'` | The path that triggers logout when navigated to. Always treated as allowed by the middleware itself. |
| `sessionGuard` | `boolean` | `false` | Opt-in [dead-session guard](/guide/route-protection#a-stale-session-looks-logged-in): clears a session whose token says it has expired and sends the user to `loginPath` when the route they asked for needs a login. Never acts on a token it cannot read. No effect (and a build-time warning) with `useServerProxy`. |
| `sessionGuardVerify` | `boolean` | `false` | Opt-in, needs `sessionGuard`: the guard also asks the server (`GET /auth/authenticated`) whether a token that still looks valid is accepted, and clears the session on a readable 401. At most one request per 30 s per token, browser only. Network failures never log anyone out. See [session handling](/guide/session-handling#server-check-opt-in). |
| `loginPath` | `string` | `'/'` | Where the session guard sends the user after clearing an expired session — e.g. `'/login'`. Always treated as allowed by the middleware itself, so it can never cause a redirect loop. |
| `managerRoles` | `string[]` | `[]` | Role names (matched against the logged-in profile's `roles`) that grant manager status. An admin always counts as a manager too, regardless of this list. |
| `securedRouteParts` | `string[]` | `[]` | Glob patterns (matched with [`minimatch`](https://www.npmjs.com/package/minimatch)) requiring the user to be logged in. |
| `managementRouteParts` | `string[]` | `[]` | Glob patterns requiring the user to be a manager (see `managerRoles`). |
| `adminRouteParts` | `string[]` | `[]` | Glob patterns requiring the user to be an admin. |
| `useServerProxy` | `boolean` | `false` | Opt-in [server proxy auth mode](/guide/server-proxy-auth) — api-key-only, no browser login. Not meant to be combined with `useGlobalAuthMiddleware`'s route protection (a build-time warning fires if both are enabled). |
| `serverProxyPath` | `string` | `'/api/_mongocamp'` | Local route prefix the proxy listens on when `useServerProxy` is `true`. |
| `formkitStyles` | `boolean` | `true` | Load the module's default styles for FormKit's label, help text, validation message and form spacing. They are loaded before your own stylesheets, so any rule of yours overrides them. See [Forms](/guide/getting-started#forms-work-without-setup). |
| `paths` | `object` | see [Paths](#paths) | Base routes of the app's MongoCamp pages. Every `*Path` prop of the components falls back to these. |

**Nothing is protected by default.** With every route-part option left as `[]`, `useGlobalAuthMiddleware: false`, and no page under a protected path, an app that adds this module gets no access restrictions at all — you must explicitly opt in by enabling the middleware and listing your protected route patterns. This is a deliberate design: the module makes no assumption about your app's URL structure (earlier versions hardcoded `/admin`/`/secured` prefixes). See [`useMongocampRoles`](/composables/use-mongocamp-roles) for the composable backing all of this, and [Route Protection](/guide/route-protection) for a full walkthrough.

All MongoCamp-server-specific configuration happens under the separate `mongocamp` key, which is forwarded to `@sfxcode/nuxt-mongocamp-server` (declared as a `moduleDependency`):

```ts
export default defineNuxtConfig({
  modules: ['nuxt-ui-mongocamp'],

  mongocamp: {
    url: 'https://your-mongocamp-server',
    apiKey: process.env.MONGOCAMP_API_KEY, // optional — stored server-side only
    paginationSize: 500,          // default: 500
    refreshToken: true,           // default: true
    tokenRefreshInterval: 5000,   // ms, default: 5000
  },
})
```

| Option | Default | Description |
|---|---|---|
| `url` | — | Base URL of your MongoCamp server. Required. |
| `apiKey` | — | Optional. Stored server-side only (`runtimeConfig.mongocampApiKey`), never sent to the browser. Required for [server proxy auth mode](/guide/server-proxy-auth); unused otherwise. |
| `paginationSize` | `500` | Default page size for paginated API calls. |
| `refreshToken` | `true` | Whether the auth token is refreshed automatically. |
| `tokenRefreshInterval` | `5000` | Refresh interval in milliseconds. |

## Environment variables (playground / local dev)

The playground app reads these from `.env`:

```bash
MONGOCAMP_URL=https://your-mongocamp-server
MONGOCAMP_ADMIN_USER=admin
MONGOCAMP_ADMIN_PASSWORD=changeme

# Optional — demo server proxy auth mode (see Server Proxy Auth)
MONGOCAMP_API_KEY=
MONGOCAMP_USE_SERVER_PROXY=true
MONGOCAMP_PROXY_SHARED_SECRET=
```

`MONGOCAMP_PROXY_SHARED_SECRET`, when set, activates the example `mongocamp-proxy:authorize` guard hook in `playground/server/plugins/mongocamp-proxy-guard.ts` — requests to the proxy route must then include an `X-Mongocamp-Proxy-Secret` header matching it. See [Server Proxy Auth](/guide/server-proxy-auth).

## Runtime plugin

The module's runtime plugin runs on app boot:

1. Fetches the MongoCamp server version via `systemApi.version()` and provides it as `$mongocampVersion`.
2. Registers the global route middleware described in [Route Protection](/guide/route-protection).

```ts
const { $mongocampVersion } = useNuxtApp()
// $mongocampVersion.value?.name
// $mongocampVersion.value?.version
```

Use the [`<MongocampVersion />`](/components/mongocamp-version) component to render this directly.

## Paths

Several components link to other pages: the dashboard to the users list, the collections table to a collection's data page, the command palette to almost everything. They need to know where your app put those pages. Set the routes once with `paths`:

```ts
export default defineNuxtConfig({
  nuxtUiMongocamp: {
    paths: {
      collections: '/db/collections',
      buckets: '/db/buckets',
      users: '/people',
    },
  },
})
```

| Key | Default | Used for |
|---|---|---|
| `home` | `/secured` | The landing page: first entry of the navigation and of every breadcrumb |
| `collections` | `/secured/admin/collections` | `<collections>/<name>` (overview) and `<collections>/<name>/data` |
| `buckets` | `/secured/admin/buckets` | `<buckets>/<bucket>` (file browser) |
| `users` | `/secured/admin/users` | The users list |
| `roles` | `/secured/admin/roles` | The roles list, and `<roles>/<role>` (a role's grants) |
| `jobs` | `/secured/admin/jobs` | The jobs list |
| `settings` | `/secured/admin/settings` | The server settings page |
| `account` | `/secured/account` | The signed-in user's account page |
| `permissions` | `/secured/admin/permissions` | The permission matrix page |
| `overview` | `/secured/admin/overview` | The server overview page |
| `databases` | `/secured/admin/databases` | The databases page |
| `server` | `/secured/admin/server` | The server status page |

A key you leave out keeps its default, and so does an empty value. A trailing slash is removed.

The `*Path` props are still there and win over `paths`, so one component can point somewhere else. Which prop falls back to which key:

| Component | Props → key |
|---|---|
| `MongocampCollections` | `infoPath`, `dataPath` → `collections`; `bucketFilesPath` → `buckets` |
| `MongocampCollectionData` | `infoPath` → `collections` |
| `MongocampServerOverview` | `infoPath`, `dataPath` → `collections`; `jobsPath` → `jobs` |
| `MongocampDashboard` | `collectionsPath` → `collections`; `usersPath` → `users`; `rolesPath` → `roles` |
| `MongocampRoles`, `MongocampPermissionMatrix` | `grantsPath` → `roles` |
| `MongocampServerStatus` | `detailsPath` → `server` |
| `MongocampCommandPalette` | `collectionPath` → `collections`; `bucketPath` → `buckets`; `usersPath` → `users`; `rolePath` → `roles`; `jobsPath` → `jobs`; `settingsPath` → `settings`; `accountPath` → `account` |

`MongocampCollectionData`'s `aggregatePath` has no fallback: without it the table shows no link to an aggregation page.

`paths` only tells the components where to link. It creates no pages and protects nothing — the route patterns of the [route protection](/guide/route-protection) are separate options. `home`, `permissions`, `overview`, `databases` and `server` are used by [`useMongocampNavigation()`](/composables/use-mongocamp-navigation) and [`useMongocampBreadcrumbs()`](/composables/use-mongocamp-breadcrumbs). Your own links can read all values with [`useMongocampPaths()`](/composables/use-mongocamp-paths).
