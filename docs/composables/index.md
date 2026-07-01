# Composables

All composables are auto-imported.

| Composable | Purpose |
|---|---|
| [`useMongocampAdmin`](/composables/use-mongocamp-admin) | User and role CRUD |
| [`useMongocampCollection`](/composables/use-mongocamp-collection) | Reactive state for paginated collection queries |
| [`useMongocampDocument`](/composables/use-mongocamp-document) | Document-level helpers (metadata stamping, partial updates) |
| [`useMongocampSchema`](/composables/use-mongocamp-schema) | Infers a schema from sampled documents; generates a matching TS interface |
| [`useMongocampBucket`](/composables/use-mongocamp-bucket) | GridFS bucket detection, file-id resolution, upload/download |
| [`useMongocampIndex`](/composables/use-mongocamp-index) | Create/list/delete MongoDB indexes (standard, unique, text, expiring) |
| [`useMongocampJobs`](/composables/use-mongocamp-jobs) | List/register/update/execute/delete scheduled background jobs |
| [`useMongocampAccount`](/composables/use-mongocamp-account) | Account self-service: profile, password change, API key regeneration |
| [`useMongocampQuery`](/composables/use-mongocamp-query) | High-level Lucene query helpers (`equals`, `like`, `inRange`, `and`, `or`, …) |
| [`useMongocampQueryBuilder`](/composables/use-mongocamp-query-builder) | Low-level Lucene syntax builder used by `useMongocampQuery` |

`@sfxcode/nuxt-mongocamp-server` additionally provides `useMongocampApi()` (raw API clients: `adminApi`, `collectionApi`, `documentApi`, `fileApi`, `bucketApi`, `informationApi`, …) and `useMongocampAuth()` (`login`, `logout`, `isLoggedIn`) — this module's composables are built on top of those.
