# useMongocampCollectionNames

The collection names of the server, loaded once and shared by everything in your app that shows them — a sidebar, a collection switcher, a panel on the dashboard. Without it each of those sends its own `listCollections` request and splits the list by its own rules.

```ts
const {
  names,        // ComputedRef<string[]> — the list as the server sent it
  collections,  // ComputedRef<string[]> — ordinary collections, sorted
  buckets,      // ComputedRef<string[]> — GridFS bucket names ('images' for images.files / images.chunks), sorted
  system,       // ComputedRef<string[]> — MongoCamp's own mc_* collections, sorted
  status,       // ComputedRef<'idle' | 'loading' | 'ready' | 'failed'>
  load,         // () => Promise<void> — asks only if nothing is loaded yet
  refresh,      // () => Promise<void> — always asks
  set,          // (names: string[]) => void — store a list you already have
  invalidate,   // () => void — forget the list
} = useMongocampCollectionNames()
```

## A sidebar

```vue
<script setup lang="ts">
const { collections, buckets, status, load } = useMongocampCollectionNames()
const paths = useMongocampPaths()

onMounted(() => load())
</script>

<template>
  <p v-if="status === 'failed'">Collections could not be loaded.</p>
  <UNavigationMenu
    orientation="vertical"
    :items="[
      ...collections.map(name => ({ label: name, to: `${paths.collections}/${name}/data` })),
      ...buckets.map(name => ({ label: name, to: `${paths.buckets}/${name}` })),
    ]"
  />
</template>
```

Mount it twice (a desktop sidebar and a mobile drawer) and there is still one request.

## Loading

- Nothing is requested until something calls `load()`.
- `load()` is safe to call from every component: it returns at once when the list is there, and joins a request that is already running.
- `load()` and `refresh()` never throw. When the request fails, `status` is `'failed'` and the last list stays on screen; the next `load()` tries again.
- The request has a 15 s timeout.

## Keeping it current

The list is cached for the signed-in user until the page is reloaded. It does not notice changes by itself.

- [`MongocampCollections`](/components/mongocamp-collections) writes every list it loads into the cache. Creating, dropping, renaming or copying a collection there reloads the table, so your sidebar is current without another request.
- After a change made anywhere else — an import into a new collection, your own code — call `refresh()`. The `changed` event of the components is a good place:

```vue
<MongocampCollectionData :collection-name="name" @changed="refresh()" />
```

## Users

The cache belongs to the user who loaded it. After a logout or a login as someone else the list is empty and `status` is `'idle'` again; an answer that arrives after the user changed is dropped. In [server proxy mode](/guide/server-proxy-auth) there is no user and one list for everybody in the browser tab.

The server decides what the list contains: a user without administrator rights gets the collections they have a grant for.

## Grouping without the composable

The split is a pure function you can use on any list of names:

```ts
import { groupCollectionNames } from '@sfxcode/nuxt-ui-mongocamp/utils'

groupCollectionNames(['orders', 'mc_users', 'images.files', 'images.chunks'])
// { collections: ['orders'], buckets: ['images'], system: ['mc_users'] }
```

See [Utilities](/guide/utilities).

## Related

- [`useMongocampPaths`](/composables/use-mongocamp-paths) — where the pages of a collection or a bucket are
- [`useMongocampPermissions`](/composables/use-mongocamp-permissions) — `readableCollections(list)` to hide what the user may not read
- [`useMongocampAdmin`](/composables/use-mongocamp-admin) — `listCollections()`, the uncached request
