# Utilities

A few of the module's pure helpers can be imported by your app, so a status bar or a sidebar formats and groups things the same way the built-in components do.

```ts
import { formatBytes, formatUptime, isProtectedCollection } from '@sfxcode/nuxt-ui-mongocamp/utils'
```

They are **not** auto-imported — an explicit import cannot clash with a function of the same name in your app. None of them needs Nuxt or Vue, and none sends a request, so they also work in server code and in tests.

## Formatting

| Helper | Result |
|---|---|
| `formatBytes(bytes)` | `'1.5 KB'`, `'12 MB'`; `'0 B'` for zero, a negative number or anything that is not a number |
| `formatUptime(seconds)` | The two biggest units: `'3d 4h'`, `'5h 12m'`, `'42s'`; `'-'` when unknown |
| `formatCount(value)` | Thousands separated by a space, independent of the locale: `'1 234 567'`; `'-'` when unknown |
| `connectionUsage(current, available)` | Share of connections in use, `0`–`100` (`current` against `current + available`); `null` when either is unknown |

```ts
const stats = await useMongocampSystem().getStats()

formatUptime(stats.uptimeSeconds)
connectionUsage(stats.connections?.current, stats.connections?.available)
```

See [`useMongocampSystem`](/composables/use-mongocamp-system) for the exact shape of `getStats()`.

## Collection names

| Helper | Result |
|---|---|
| `isBucketMemberCollection(name)` | `true` for `<bucket>.files` and `<bucket>.chunks`, the two halves of a GridFS bucket |
| `bucketNameOf(name)` | `'images'` for `images.files` / `images.chunks`; `null` for any other collection |
| `isProtectedCollection(name)` | `true` for MongoCamp's own `mc_*` collections and for bucket halves — the collections the module never offers to clear, drop, copy or rename |

Splitting a collection list the way the playground's sidebar does:

```ts
import { bucketNameOf, isBucketMemberCollection } from '@sfxcode/nuxt-ui-mongocamp/utils'

const names = await useMongocampAdmin().listCollections()

const buckets = [...new Set(names.map(bucketNameOf).filter(name => name !== null))]
const system = names.filter(name => name.startsWith('mc_'))
const collections = names.filter(name => !name.startsWith('mc_') && !isBucketMemberCollection(name))
```

## What is not exported

Only the helpers on this page are public API. The module has many more files under `runtime/utils` — they are internal and can change in any release, so do not import them by a deep path.
