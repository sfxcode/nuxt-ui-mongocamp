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
    managerRoles: ['support'],                      // default: []
    securedRouteParts: ['/secured/**'],              // default: []
    managementRouteParts: ['/secured/manage/**'],    // default: []
    adminRouteParts: ['/secured/admin/**'],          // default: []
    useServerProxy: false,                          // default: false
    serverProxyPath: '/api/_mongocamp',             // default shown
  },
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `useGlobalAuthMiddleware` | `boolean` | `false` | Registers the global `global-auth` route middleware. Opt-in — nothing is protected unless this is `true`. |
| `notAllowedPath` | `string` | `'/'` | Where the middleware redirects on any disallowed route. Always treated as allowed by the middleware itself, so it can never cause a redirect loop — set it to e.g. `'/login'` for apps that gate everything behind a login page. |
| `logoutRedirectPath` | `string` | `'/'` | Where the middleware redirects after `/logout`. A separate option from `notAllowedPath`, also always treated as allowed — so a deliberate logout can land somewhere different from an auth-failure redirect (e.g. the home page instead of the login page). |
| `managerRoles` | `string[]` | `[]` | Role names (matched against the logged-in profile's `roles`) that grant manager status. An admin always counts as a manager too, regardless of this list. |
| `securedRouteParts` | `string[]` | `[]` | Glob patterns (matched with [`minimatch`](https://www.npmjs.com/package/minimatch)) requiring the user to be logged in. |
| `managementRouteParts` | `string[]` | `[]` | Glob patterns requiring the user to be a manager (see `managerRoles`). |
| `adminRouteParts` | `string[]` | `[]` | Glob patterns requiring the user to be an admin. |
| `useServerProxy` | `boolean` | `false` | Opt-in [server proxy auth mode](/guide/server-proxy-auth) — api-key-only, no browser login. Not meant to be combined with `useGlobalAuthMiddleware`'s route protection (a build-time warning fires if both are enabled). |
| `serverProxyPath` | `string` | `'/api/_mongocamp'` | Local route prefix the proxy listens on when `useServerProxy` is `true`. |

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

1. Fetches the MongoCamp server version via `informationApi.version()` and provides it as `$mongocampVersion`.
2. Registers the global route middleware described in [Route Protection](/guide/route-protection).

```ts
const { $mongocampVersion } = useNuxtApp()
// $mongocampVersion.value?.name
// $mongocampVersion.value?.version
```

Use the [`<MongocampVersion />`](/components/mongocamp-version) component to render this directly.
