# Building an admin app

The module owns no routes or pages: you decide where each component lives and pass the targets in as `*Path` props. The playground is the reference wiring; this page lists the pieces.

## Pages

| Page | Component | Path props that link onward |
|---|---|---|
| Collections | `MongocampCollections` | `infoPath`, `dataPath`, `bucketFilesPath` |
| Collection → Data | `MongocampCollectionData` | `infoPath` |
| Collection → Overview | `MongocampCollectionInfos` (stats, indexes, schema, distribution) | — |
| Collection → Aggregate | `MongocampAggregationBuilder` | — |
| Bucket | `MongocampBucketFiles` | — |
| Users / Roles / Role grants | `MongocampUsers`, `MongocampRoles` (`grantsPath`), `MongocampRoleGrants` | — |
| Permissions | `MongocampPermissionMatrix` | `grantsPath` |
| Server overview / Dashboard | `MongocampServerOverview`, `MongocampDashboard` | `infoPath`, `dataPath`, `jobsPath` |
| Jobs, Databases, Settings, Account | `MongocampJobs`, `MongocampDatabases`, `MongocampSettings`, `MongocampAccount` | — |

Add one [`MongocampCommandPalette`](/components/mongocamp-command-palette) to the layout (⌘K) and the pages are reachable from anywhere.

## The glue the playground keeps

Three small pieces, all in `playground/app/`:

- `components/CollectionTabs.vue` — the collection name and **Data | Overview | Aggregate** tabs (`UNavigationMenu` with the three routes under `/secured/admin/collections/<name>`).
- `components/CollectionSidebar.vue` — one `listCollections()` request, grouped as **Collections**, **Buckets** (`<name>.files`) and **MongoCamp** (`mc_*`).
- `layouts/collection.vue` — the default frame plus the sidebar and the palette; collection and bucket pages choose it with `definePageMeta({ layout: 'collection' })`.

That is the whole "shell". It is deliberately not a module component: it is about forty lines of routing choices that differ per app (URL scheme, which tabs, which sidebar groups), so shipping it would only add props that mirror what a layout already expresses. If your app repeats more glue than this, wrap it in your own component.
