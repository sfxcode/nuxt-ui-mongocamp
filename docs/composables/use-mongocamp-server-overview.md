# useMongocampServerOverview

What [`MongocampServerOverview`](/components/mongocamp-server-overview) shows, loaded in one call.

```ts
const { loadOverview } = useMongocampServerOverview()

const overview = await loadOverview({ maxCollections: 200, signal })
overview.collections   // [{ name, count, size, storageSize, avgObjSize, indexCount, totalIndexSize }]
overview.databases     // DatabaseInfo[] | null
overview.cluster       // { coordinator, members } | null
overview.jobs          // JobInformation[] | null
overview.errors        // the first error of each part that failed
```

- The parts (databases, collection names, cluster, jobs) are read in parallel and are **independent**: one that fails is `null` (or `collections: []`) and named in `errors`; the others keep their data.
- The numbers of **all** collections come in **one request** (`GET /mongodb/collections/info`, server 1.7.0; before that it was one request per collection, a few at a time, with progress). At most `maxCollections` (default 200) are kept: `skipped` counts the rest, `failed` the collections the server listed with `available: false`, `collectionCount` all of them. `mc_*` collections are left out.
- Aborting rejects with an `AbortError`; nothing partial is returned.
- The collection request has a 15 s limit.

The pure helpers (`rankCollections`, `overviewTotals`, `shareSlices`, `nextJobs`) live in `utils/serverOverview.ts`.
