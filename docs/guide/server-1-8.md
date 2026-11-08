# Server 1.8

The module needs **MongoCamp server 1.8.1 or later** (`@sfxcode/nuxt-mongocamp-server` ^1.8.0 — its generated client already has every endpoint below). There is deliberately no compatibility code for older servers. This page lists what the 1.7 / 1.8 servers made possible, what changed for you as a consumer, and what is still worked around.

## What the module uses now

| Server feature | Where you see it |
|---|---|
| `POST …/documents/search` | the data table and `useMongocampFetchAll` — a long filter is no longer a URL |
| `GET …/documents/count`, Lucene `filter` on `updateMany` / `deleteMany` | **Select all matching** is one request ([`useMongocampBulkByFilter`](/composables/use-mongocamp-bulk-by-filter)) — no cap, no id snapshot |
| `GET /auth/permissions` | [`useMongocampPermissions().load()`](/composables/use-mongocamp-permissions) — the server's answer, also in proxy mode |
| `GET /mongodb/collections/info` | [`MongocampCollections`](/components/mongocamp-collections) and [`MongocampServerOverview`](/components/mongocamp-server-overview) read all collections in one request |
| `aggregate?filter=` | [`runAggregation({ filter })`](/composables/use-mongocamp-aggregation), the `filter` prop of [`MongocampCollectionCharts`](/components/mongocamp-collection-charts) |
| `insertMany?ordered=false` | the importer: a duplicate no longer stops its batch; refused rows are listed exactly |
| `POST …/collections/{name}/copy`, `/rename` | [`MongocampCollectionCopy`](/components/mongocamp-collection-copy) (no cap, indexes copied from the real specs), new [`MongocampCollectionRename`](/components/mongocamp-collection-rename) |
| `GET …/index/details`, ordered create | [`MongocampIndexes`](/components/mongocamp-indexes): real key order, sparse / hidden / partial / collation flags, multi-field text indexes |
| `GET …/fields/detail` | [`listFieldDetails`](/composables/use-mongocamp-aggregation), the chart kind detection, nested field suggestions |
| `extendedJson=canonical`, all wrappers on write | **View** and **Edit** in [`MongocampCollectionData`](/components/mongocamp-collection-data#typed-reads) keep int / long / double / decimal and date-looking text intact |
| `GET …/documents/export`, `POST …/documents/import` | [`MongocampExportAll`](/components/mongocamp-export-all) streams with no cap; the import wizard sends NDJSON files as they are |

## Changes that can affect your code

- **`MongocampBulkDelete`** lost the props `collecting` and `progress` and the events `cancelCollect` and `stop`; it gained `counting` and `selectedCount`. **`MongocampBulkEdit`** lost `progress` and `stop`.
- **`MongocampServerOverview`**: the progress bar and Stop button are gone; `useMongocampServerOverview().loadOverview()` no longer takes `concurrency` or `onProgress`.
- **`useMongocampCollectionCopy`**: the browser-side copy is gone — `copyCollection` returns `{ target, count, indexes }`; `retryBatches`, `copyIndexes` and the 50 000 cap were removed.
- **`useMongocampExportAll`**: no `maxRows` default of 50 000; the result is `{ blob, filename, mimeType, format, bytes, documents?, incomplete }` instead of text and `truncated`.
- **`useMongocampPermissions`** gained `load()`; call it (the module's own components do) to use the server's answer instead of the profile's grants.
- **`MongocampCollectionData`** edits always read the document first (`extendedJson=canonical`, one extra request), and the document path helper `inferStrings` was removed.

## Server settings worth knowing

- **`AUTH_GRANT_DENIED_STATUS`** — a request for a collection the user has no grant for answers `401` by default (the server plans `403` for the next major version). On `401` the dependency clears the session, so the module keeps a middleware that turns that `401` into a `403` ([`useMongocampClientApi`](/composables/use-mongocamp-client-api#a-missing-grant-is-not-a-dead-session)). Set `AUTH_GRANT_DENIED_STATUS=403` and it simply never fires.
- **`IMPORT_MAX_BYTES`** — the size limit of an NDJSON import (`413` above it; there is no time limit).

## Still worked around (server 1.8.1)

- **Lucene gaps**: open ranges, `>=`, `_exists_`, number/date wildcards, bare one-day ranges and negated `AND` groups (MongoCamp/mongocamp-server#69, #70) — see [`useMongocampQuery`](/composables/use-mongocamp-query).
- **Raw aggregation stats stages**: `$indexStats` / `$collStats` rows still carry `host`, `ns` and `spec`; the module strips them for its own calls ([`runAggregation`](/composables/use-mongocamp-aggregation)). The dedicated `index/stats` endpoint is clean.
- **`$lookup` and `$unionWith`** are not on the server's deny-list, but the server enforces the caller's grants for the other collection (a non-admin without a grant gets `403`, code `4032`; an admin can read every collection anyway, `mc_users` included). The aggregation builder still refuses them in the UI as an early, friendly stop.
- **Partial index filters** are listed garbled by `index/details`; the index card shows only that there is one.
- **Long filters in a URL**: aggregation, export and bucket file lists send the Lucene filter as a query parameter — over ~1 800 encoded characters the module refuses it up front (the server's `414` has no CORS headers). The document list uses `POST …/search` and has no such limit.
