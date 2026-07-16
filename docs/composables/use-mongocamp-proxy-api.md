# useMongocampProxyApi

Client-side drop-in for `@sfxcode/nuxt-mongocamp-server`'s `useMongocampApi()` — same returned shape (`adminApi`, `documentApi`, `collectionApi`, `fileApi`, …), but every API instance is pointed at this module's local proxy route instead of the real MongoCamp URL.

```ts
const { adminApi, documentApi, /* ... */ } = useMongocampProxyApi()
```

No token or api key is set client-side — auth is injected entirely server-side by the proxy route (see [Server Proxy Auth](/guide/server-proxy-auth)). The base path comes from `serverProxyPath` (`nuxtUiMongocamp` config, default `/api/_mongocamp`).

You won't normally call this directly — [`useMongocampClientApi`](/composables/use-mongocamp-client-api) picks between this and the session-mode client automatically based on `useServerProxy`, and every built-in composable/component already goes through that instead.

## Related

- [`useMongocampClientApi`](/composables/use-mongocamp-client-api) — the mode-switching composable that wraps this one
- [Server Proxy Auth](/guide/server-proxy-auth) — the full guide
