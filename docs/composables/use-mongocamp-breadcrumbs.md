# useMongocampBreadcrumbs

The breadcrumb of the current route among the module's pages, e.g. **Home › Collections › test_customer › Data**.

```vue
<script setup lang="ts">
const breadcrumbs = useMongocampBreadcrumbs()
</script>

<template>
  <UBreadcrumb :items="breadcrumbs" />
</template>
```

It returns a computed array of `{ label, to?, icon? }` that follows the route and the locale. The last item has no `to` — it is the current page.

## How a route is read

The composable knows your routes from the module option [`paths`](/guide/configuration#paths). With the default paths:

| Route | Breadcrumb |
|---|---|
| `/secured` | Home |
| `/secured/admin/users` | Home › Users |
| `/secured/admin/collections/test_customer` | Home › Collections › test_customer |
| `/secured/admin/collections/test_customer/data` | Home › Collections › test_customer › Data |
| `/secured/admin/collections/test_customer/aggregate` | Home › Collections › test_customer › Aggregate |
| `/secured/admin/buckets/images` | Home › Buckets › images |
| `/secured/admin/roles/support` | Home › Roles › support |

- Page names are translated. The name of a collection, a bucket or a role is taken from the URL and shown as it is.
- **Buckets** links to the collections list, because buckets have no list page of their own.
- When two configured paths both match, the longer one wins.
- A route that belongs to none of the configured pages — one of your app's own — gives just **Home**. Add your own items for those:

```ts
const base = useMongocampBreadcrumbs()
const route = useRoute()

const breadcrumbs = computed(() =>
  route.path.startsWith('/reports')
    ? [{ ...base.value[0], to: useMongocampPaths().home }, { label: 'Reports' }]
    : base.value)
```

## Related

- [`useMongocampNavigation`](/composables/use-mongocamp-navigation) — the same pages as a menu
- [`useMongocampPaths`](/composables/use-mongocamp-paths)
