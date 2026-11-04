# useMongocampServerOverview

What [`MongocampServerOverview`](/components/mongocamp-server-overview) shows, loaded in one call.

```ts
const { loadOverview } = useMongocampServerOverview()

const overview = await loadOverview({ maxCollections: 200, concurrency: 6, signal, onProgress: ({ done, total }) => {} })
overview.collections   // [{ name, count, size, storageSize, avgObjSize, indexCount, totalIndexSize }]
overview.databases     // DatabaseInfo[] | null
overview.cluster       // { coordinator, members } | null
overview.jobs          // JobInformation[] | null
overview.errors        // the first error of each part that failed
```

- The parts (databases, collection names, cluster, jobs) are read in parallel and are **independent**: one that fails is `null` (or `collections: []`) and named in `errors`; the others keep their data.
- There is **one request per collection** (`getCollectionInformation`), `concurrency` at a time (default 6), at most `maxCollections` (default 200). `skipped` counts the rest, `failed` the collections whose request failed, `collectionCount` all of them. `mc_*` collections are left out.
- `onProgress` is called with `{ done: 0, total }` first, then after every collection.
- Aborting rejects with an `AbortError`; nothing partial is returned.
- Every collection request has a 15 s limit.

The pure helpers (`rankCollections`, `overviewTotals`, `shareSlices`, `nextJobs`) live in `utils/serverOverview.ts`; `mapLimit` in `utils/limitedMap.ts`.
