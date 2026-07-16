# useMongocampClientApi

The mode-switching indirection every other composable/component in this module calls instead of `@sfxcode/nuxt-mongocamp-server`'s `useMongocampApi()` directly — a drop-in with the exact same return shape.

```ts
const { adminApi, documentApi, collectionApi, /* ... */ } = useMongocampClientApi()
```

## What it does

Reads `useServerProxy` from `nuxtUiMongocamp` (via `useRuntimeConfig().public.nuxtUiMongocampOptions`) and returns:

- `useMongocampApi()` (the dependency's browser-session client) when `useServerProxy` is `false` — the default.
- [`useMongocampProxyApi()`](/composables/use-mongocamp-proxy-api) (this module's local-proxy client) when `useServerProxy` is `true`.

See [Server Proxy Auth](/guide/server-proxy-auth) for the full picture — what proxy mode is for, how to enable it, and how to guard it. You won't normally call `useMongocampClientApi` directly: it exists so that `MongocampUsers`, `MongocampCollections`, `useMongocampAdmin`, and every other built-in composable/component keep working unmodified in either mode.

## Related

- [`useMongocampProxyApi`](/composables/use-mongocamp-proxy-api) — the proxy-mode branch
- [Server Proxy Auth](/guide/server-proxy-auth) — the full guide
