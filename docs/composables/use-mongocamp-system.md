# useMongocampSystem

Read-only wrapper for `databaseApi`. Powers [`MongocampDatabases`](/components/mongocamp-databases).

```ts
const {
  listDatabases,             // () => Promise<string[]>
  getDatabaseInfos,          // () => Promise<DatabaseInfo[]>
  getDatabaseInfo,           // (databaseName: string) => Promise<DatabaseInfo>
  listCollectionsByDatabase, // (databaseName: string) => Promise<string[]>
} = useMongocampSystem()
```

## Deliberately scoped to databases only

`databaseApi.deleteDatabase` is **not** wrapped here — it's a cross-cutting, highly destructive action, and every other component in this module implicitly assumes a single default database, so exposing multi-database deletion needs its own design pass, not a bolt-on to a generic viewer.

`applicationApi` (server settings, plugin list, configuration values) is not wrapped by this composable at all for now.

If you need write access to databases or access to `applicationApi`, call `useMongocampApi()` directly rather than extending this composable — that keeps the "read-only, databases-only" contract here honest for anything that does rely on it.

## `getDatabaseInfos` vs `listDatabases`

`getDatabaseInfos()` returns full `DatabaseInfo` objects (`name`, `sizeOnDisk`, `empty`, `fetched`, `map`) for every database in one call — use this for a listing table. `listDatabases()` returns just the name strings; `getDatabaseInfo(databaseName)` fetches detail for one database at a time. Prefer `getDatabaseInfos()` over `listDatabases()` + N `getDatabaseInfo()` calls to avoid an N+1 request pattern.

## Every call has a 15s timeout

The generated API client has no built-in request timeout — a hung server response otherwise leaves the caller's promise pending forever (neither resolved nor rejected), which no amount of `try`/`catch` in the calling component can recover from. Every method here passes an `AbortSignal.timeout(15000)` via `initOverrides`, so a dead or slow endpoint always surfaces as a rejected promise within 15 seconds instead of hanging the page indefinitely.
