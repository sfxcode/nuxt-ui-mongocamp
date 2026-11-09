# Composables

All composables are auto-imported.

| Composable | Purpose |
|---|---|
| [`useMongocampAdmin`](/composables/use-mongocamp-admin) | User and role CRUD |
| [`useMongocampCollection`](/composables/use-mongocamp-collection) | Reactive state for paginated collection queries |
| [`useMongocampDocument`](/composables/use-mongocamp-document) | Document-level helpers (metadata stamping, partial updates) |
| [`useMongocampSchema`](/composables/use-mongocamp-schema) | Infers a schema from sampled documents; generates a matching TS interface |
| [`useMongocampBucket`](/composables/use-mongocamp-bucket) | GridFS bucket detection, file-id resolution, upload (also `uploadFiles`)/download/`fetchFileBlob` |
| [`useMongocampIndex`](/composables/use-mongocamp-index) | Create/list/delete MongoDB indexes (standard, unique, text, expiring) |
| [`useMongocampJobs`](/composables/use-mongocamp-jobs) | List/register/update/execute/delete scheduled background jobs |
| [`useMongocampAccount`](/composables/use-mongocamp-account) | Account self-service: profile, password change, API key regeneration |
| [`useMongocampSystem`](/composables/use-mongocamp-system) | Read-only database viewer (list, per-database info, collections), cluster members and masked server settings |
| [`useMongocampExport`](/composables/use-mongocamp-export) | `rowsToCsv` and `downloadTextFile` for exporting rows already on screen |
| [`useMongocampFilterBuilder`](/composables/use-mongocamp-filter-builder) | Turns filter rows (field, operator, value) into one Lucene query; type-aware operators, injection-safe |
| [`useMongocampAdminGate`](/composables/use-mongocamp-admin-gate) | `blocked` / `message` for components that need an administrator: show "administrators only" without a request |
| [`useMongocampFieldTypes`](/composables/use-mongocamp-field-types) | field paths with the types of their values for a collection (`fields/detail`, cached): filter fields, write hints |
| [`useMongocampBulkByFilter`](/composables/use-mongocamp-bulk-by-filter) | `countDocuments` / `deleteByFilter` / `updateByFilter`: one request each by the Lucene filter of the list |
| [`useMongocampBulkDelete`](/composables/use-mongocamp-bulk-delete) | `runBulkDelete`: delete many items with limited concurrency (or one request per chunk) and a per-item failure report |
| [`useMongocampImport`](/composables/use-mongocamp-import) | `importRows`: insert documents in batches with a per-batch failure report |
| [`useMongocampAggregation`](/composables/use-mongocamp-aggregation) | `runAggregation` (server-side paging, deny-listed stages refused), `listDistinct`, `sampleDocuments`, readable aggregation errors |
| [`useMongocampError`](/composables/use-mongocamp-error) | Maps API errors (network / 401 / 403 / other) to readable messages |
| [`useMongocampQuery`](/composables/use-mongocamp-query) | High-level Lucene query helpers (`equals`, `like`, `inRange`, `and`, `or`, …) |
| [`useMongocampQueryBuilder`](/composables/use-mongocamp-query-builder) | Low-level Lucene syntax builder used by `useMongocampQuery` |
| [`useMongocampExtendedJson`](/composables/use-mongocamp-extended-json) | Converts MongoDB extended-JSON documents to/from the plain values `FUAutoForm` binds to |
| [`useMongocampSession`](/composables/use-mongocamp-session) | Is the login still usable? Token-expiry check (no request), optional server check (`verify`), `invalidateSession` |
| [`useMongocampRoles`](/composables/use-mongocamp-roles) | Role/route-pattern access checks (`isAdmin`, `isManager`, `isAllowedPathForRoute`); powers the global nav guard |
| [`useMongocampPermissions`](/composables/use-mongocamp-permissions) | May the user read / write / administer a collection? From the grants in the session profile; UI-level gating that fails open |
| [`useMongocampFetchAll`](/composables/use-mongocamp-fetch-all) | Reads every page of a document or file list with a cap, progress and abort (`fetchAllDocuments`, `fetchAllFiles`) |
| [`useMongocampExportAll`](/composables/use-mongocamp-export-all) | Exports a whole collection or filter as JSON, NDJSON or CSV (cap, progress, abort; exact 64-bit integers) |
| [`useMongocampPersistedState`](/composables/use-mongocamp-persisted-state) | A ref remembered in `localStorage` (versioned, size-capped, never throws) |
| [`useMongocampSavedQueries`](/composables/use-mongocamp-saved-queries) | Saved filters and recent history per collection, browser-only, validated and capped; JSON export/import |
| [`useMongocampAutoRefresh`](/composables/use-mongocamp-auto-refresh) | Interval loads for live views: no overlap, backoff, pauses in a hidden tab, stops on unmount |
| [`useMongocampCollectionStats`](/composables/use-mongocamp-collection-stats) | Typed storage sizes and per-index usage (`$indexStats`, host stripped) of one collection |
| [`useMongocampCollectionCopy`](/composables/use-mongocamp-collection-copy) | Copy a collection into a new one (`copyCollection`) and a timestamped quick backup (`backupCollection`) |
| [`useMongocampSavedPipelines`](/composables/use-mongocamp-saved-pipelines) | Saved aggregation pipelines per collection, browser-only, re-checked against the deny-list on every read |
| [`useMongocampServerOverview`](/composables/use-mongocamp-server-overview) | Databases, per-collection sizes (one request each, capped, progress), cluster and jobs in one call; parts fail independently |
| [`useMongocampClientApi`](/composables/use-mongocamp-client-api) | Mode-switching drop-in for `useMongocampApi()` — session or [server proxy](/guide/server-proxy-auth) mode |
| [`useMongocampProxyApi`](/composables/use-mongocamp-proxy-api) | The server-proxy-mode branch `useMongocampClientApi` switches to |

`@sfxcode/nuxt-mongocamp-server` additionally provides `useMongocampApi()` (raw API clients: `adminApi`, `collectionApi`, `documentApi`, `fileApi`, `bucketApi`, `systemApi`, …) and `useMongocampAuth()` (`login`, `logout`, `isLoggedIn`) — this module's composables are built on top of those.
