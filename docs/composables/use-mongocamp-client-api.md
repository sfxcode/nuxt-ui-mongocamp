# useMongocampClientApi

The mode-switching indirection every other composable/component in this module calls instead of `@sfxcode/nuxt-mongocamp-server`'s `useMongocampApi()` directly — a drop-in with the exact same return shape.

```ts
const { adminApi, documentApi, collectionApi, /* ... */ } = useMongocampClientApi()
```

## What it does

Reads `useServerProxy` from `nuxtUiMongocamp` (via `useRuntimeConfig().public.nuxtUiMongocampOptions`) and returns:

- `useMongocampApi()` (the dependency's browser-session client) when `useServerProxy` is `false` — the default.
- [`useMongocampProxyApi()`](/composables/use-mongocamp-proxy-api) (this module's local-proxy client) when `useServerProxy` is `true`.

## A missing grant is not a dead session

MongoCamp server 1.6.3 answers a request the user has no grant for — a collection without a grant, a write with a read-only grant, every admin-only endpoint — with HTTP **401**, code `4011` and a message that says what was missing (`user not authorized for collection` / `… for request`). A token that really is dead gets the same code with the plain message `user not authorized`. The dependency clears the stored session on *any* 401, so one forbidden request would log a non-admin user out (and the alert would say their session had expired).

Both modes therefore install a small middleware (`utils/permissionDenied.ts`) in front of the dependency's: a 401 whose body says `user not authorized for …` is turned into a **403** with the same body before anything else sees it. The dependency leaves a 403 alone, `useMongocampError` reports it as "no permission", and the user stays logged in. A dead token is still a 401 and still clears the session; a 401 without a readable JSON body is kept as a 401. In session mode the middleware is put first in the list the dependency's API instances share (they are built from one configuration); in proxy mode it is part of the proxy client's configuration (there the api key may have limited grants too, and no session is involved).

See [Server Proxy Auth](/guide/server-proxy-auth) for the full picture — what proxy mode is for, how to enable it, and how to guard it. You won't normally call `useMongocampClientApi` directly: it exists so that `MongocampUsers`, `MongocampCollections`, `useMongocampAdmin`, and every other built-in composable/component keep working unmodified in either mode.

## Related

- [`useMongocampProxyApi`](/composables/use-mongocamp-proxy-api) — the proxy-mode branch
- [Server Proxy Auth](/guide/server-proxy-auth) — the full guide
