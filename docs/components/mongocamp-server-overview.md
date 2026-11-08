# MongocampServerOverview

What an admin wants to see first: how much the server holds and where. Stat cards, the **biggest collections** (a chart and a ranked list that links to each collection), the **share of storage**, the **databases**, the **cluster** and the **next scheduled jobs**. Read-only.

## Usage

```vue
<template>
  <MongocampServerOverview
    info-path="/admin/collections"
    data-path="/admin/collections"
    jobs-path="/admin/jobs"
    :auto-refresh="60"
  />
</template>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `infoPath` | `string` | `/secured/admin/collections` | Base path of the page rendering [`MongocampCollectionInfos`](/components/mongocamp-collection-infos) (`<infoPath>/<name>`) |
| `dataPath` | `string` | `/secured/admin/collections` | Base path of the data pages (`<dataPath>/<name>/data`) |
| `jobsPath` | `string` | `/secured/admin/jobs` | Target of **All jobs** |
| `topN` | `number` | `10` | How many collections the ranking and the chart show |
| `maxCollections` | `number` | `200` | Read at most this many collections |
| `autoRefresh` | `number` | `0` | Reload every N seconds (at least 1; `0` = off) through [`useMongocampAutoRefresh`](/composables/use-mongocamp-auto-refresh): pauses in a hidden tab, backs off after failures; a failed background reload keeps the numbers on screen |
| `hideCharts` | `boolean` | `false` | The cards and lists only, no charts |

## What it shows

| Part | Content |
|---|---|
| Stat cards | databases (with the size on disk), collections, documents, storage of the collections, **index weight** (and its share of the size on disk) |
| Biggest collections | **Rank by** storage on disk, documents, average document size or index size; a bar chart and a ranked list (info link on the name, a data link per row) |
| Share of storage | a donut: the five biggest collections and one slice for all the others |
| Databases | size on disk per database (a bar chart when there are several) and a list, `empty` marked |
| Cluster | the members, with **Coordinator** and **Site master** badges |
| Next jobs | the next five scheduled runs, soonest first; a job with no next run is left out |

MongoCamp's own `mc_*` collections are not counted. GridFS buckets are: their `.files` and `.chunks` collections hold the bytes.

## Requests, limits and failures

- **One request for all collections** (`GET /mongodb/collections/info`, server 1.7.0).
- **Capped at `maxCollections`** (200). If there are more, the overview says *4 of 6 collections were read; 2 were left out*.
- **Every part stands on its own.** If the databases, the cluster or the jobs cannot be read, a warning names the part with **Try again** and the rest still shows. A collection the server lists as unavailable is named (*1 collections could not be read: users*).

The charts are [`MongocampChart`](/components/mongocamp-chart) and have a text description and a table alternative.
