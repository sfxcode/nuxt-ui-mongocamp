# Server Proxy Auth

Server proxy mode is a second, **optional** way to authenticate against MongoCamp — for apps that only have an api key (no user login at all) and must never let that key reach the browser.

In the default mode, the browser logs in and talks to MongoCamp directly using a session token (see [Route Protection](/guide/route-protection)). In server proxy mode there is no login: the browser calls a local route on your own Nuxt server instead, and that route forwards the request to MongoCamp with the api key injected server-side. The browser never sees the MongoCamp URL's credentials or the key itself.

```ts
export default defineNuxtConfig({
  modules: ['nuxt-ui-mongocamp'],

  // The dependency's own config key
  mongocamp: {
    url: 'https://your-mongocamp-server',
    apiKey: process.env.MONGOCAMP_API_KEY, // never exposed to the browser
  },

  nuxtUiMongocamp: {
    useServerProxy: true,              // default: false
    serverProxyPath: '/api/_mongocamp', // default shown
  },
})
```

Every built-in composable and component already goes through [`useMongocampClientApi`](/composables/use-mongocamp-client-api), which picks session mode or proxy mode based on `useServerProxy` — so nothing else in your app needs to change. `MongocampUsers`, `MongocampCollections`, `useMongocampAdmin`, etc. all keep working exactly as before, just pointed at the local proxy instead of talking to MongoCamp directly.

## How it works

The module registers a catch-all route at `serverProxyPath` (`/api/_mongocamp/**` by default). On every request it:

1. Responds `404` immediately if `useServerProxy` is `false` (the default) — the route only does anything once you opt in.
2. Forwards the request to `${mongocamp.url}` with the same path, method, query, and body.
3. Injects the configured api key as an `X-AUTH-APIKEY` header.
4. Neutralizes any `Authorization` header the caller sent — auth against MongoCamp in this mode can only ever come from the server-side api key, never from whatever a caller put on their own request.

## ⚠️ The proxy route is unguarded by default

The api key grants **full** access to MongoCamp — documents, admin user/role management, buckets, job execution, everything. Anyone who can reach `serverProxyPath` gets that same access, since the route is a generic passthrough with no built-in caller authentication. If your Nuxt server is reachable by anyone other than fully trusted callers, you must guard it yourself.

### The `mongocamp-proxy:authorize` hook

Register a Nitro hook from your own app — e.g. in `server/plugins/mongocamp-proxy-guard.ts` — to reject requests before they reach MongoCamp:

```ts
// server/plugins/mongocamp-proxy-guard.ts
import type { H3Event } from 'h3'
import { createError } from 'h3'

// `NitroApp['hooks']` doesn't know about this module's hook name, so it's reached through a
// small local interface instead of an `any` cast.
interface MongocampProxyHooks {
  hook: (name: 'mongocamp-proxy:authorize', fn: (event: H3Event) => void | Promise<void>) => void
}

export default defineNitroPlugin((nitroApp) => {
  const hooks = nitroApp.hooks as unknown as MongocampProxyHooks
  hooks.hook('mongocamp-proxy:authorize', (event) => {
    const token = getHeader(event, 'x-app-session')
    if (!isValidAppSession(token)) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
  })
})
```

- No hook registered → every request is allowed through (the default — the module has no opinion on how you authenticate your own callers).
- A registered handler that throws (typically via `createError`) rejects the request with that error, and MongoCamp is never called.
- What "valid" means is entirely up to you — a session cookie from your own app's login, an internal service token, an IP allowlist, whatever fits your deployment.

## Not compatible with route-protection's login state

[`useGlobalAuthMiddleware`](/guide/route-protection)'s `securedRouteParts`/`managementRouteParts`/`adminRouteParts` all key off `isLoggedIn`/`isAdmin`/`isManager` — state that only exists after a real MongoCamp login. Server proxy mode has no login, so those checks can never pass, and every route matched by one of those lists becomes permanently unreachable. The module warns about this at build time if both `useServerProxy` and `useGlobalAuthMiddleware` are enabled together — use the `mongocamp-proxy:authorize` hook above for request-level guarding instead.
