# useMongocampSystem

Read-only wrapper for `databaseApi` and `applicationApi`. Powers [`MongocampDatabases`](/components/mongocamp-databases) and [`MongocampSettings`](/components/mongocamp-settings).

```ts
const {
  listDatabases,             // () => Promise<string[]>
  getDatabaseInfos,          // () => Promise<DatabaseInfo[]>
  getDatabaseInfo,           // (databaseName: string) => Promise<DatabaseInfo>
  listCollectionsByDatabase, // (databaseName: string) => Promise<string[]>
  getSettings,               // () => Promise<{ routesPlugins, filePlugins, ignoredPlugins }>
  listConfigurations,        // () => Promise<ConfigRow[]>   — sorted by key, secrets already masked
  getConfig,                 // (configurationKey: string) => Promise<ConfigRow>  — masked
} = useMongocampSystem()
```

## Read-only, and secrets never leave it

`databaseApi.deleteDatabase`, `applicationApi.shutdown` and `applicationApi.updateConfiguration` are **not** wrapped here — they are cross-cutting and highly destructive, and the composable does not expose a write path of any kind. If you need one, call `useMongocampApi()` directly rather than extending this composable, which keeps the "read-only" contract honest for anything that relies on it.

The server's settings and configuration payloads contain real secrets (the auth secret, database credentials and host), so the settings methods never hand them out:

- `getSettings()` returns the three plugin lists only; the response's repeated configuration map is dropped.
- `listConfigurations()` and `getConfig(key)` return `ConfigRow`s — `{ key, value, masked, configType, needsRestart, comment }` — in which a secret's `value` is already `"••••••••"` and the original was never copied. See [`MongocampSettings`](/components/mongocamp-settings) for the masking rule. `getConfig` throws if the server answers with something that is not a configuration.

Values are normalised on the way in: the generated client types a configuration's `value` as a number, but real values are numbers, booleans, strings, lists, `null` and Option values wrapped as `{ value }`.

## `getDatabaseInfos` vs `listDatabases`

`getDatabaseInfos()` returns full `DatabaseInfo` objects (`name`, `sizeOnDisk`, `empty`, `fetched`, `map`) for every database in one call — use this for a listing table. `listDatabases()` returns just the name strings; `getDatabaseInfo(databaseName)` fetches detail for one database at a time. Prefer `getDatabaseInfos()` over `listDatabases()` + N `getDatabaseInfo()` calls to avoid an N+1 request pattern.

## Every call has a 15s timeout

The generated API client has no built-in request timeout — a hung server response otherwise leaves the caller's promise pending forever (neither resolved nor rejected), which no amount of `try`/`catch` in the calling component can recover from. Every method here passes an `AbortSignal.timeout(15000)` via `initOverrides`, so a dead or slow endpoint always surfaces as a rejected promise within 15 seconds instead of hanging the page indefinitely.
