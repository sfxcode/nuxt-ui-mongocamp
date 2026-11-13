# useMongocampPaths

Returns the base routes of your app's MongoCamp pages — the module option [`paths`](/guide/configuration#paths) with the defaults filled in.

```ts
const paths = useMongocampPaths()
// {
//   collections: '/secured/admin/collections',
//   buckets: '/secured/admin/buckets',
//   users: '/secured/admin/users',
//   roles: '/secured/admin/roles',
//   jobs: '/secured/admin/jobs',
//   settings: '/secured/admin/settings',
//   account: '/secured/account',
// }
```

It is a plain object, not a ref: the option is fixed when the app is built.

The components use it for every link whose `*Path` prop you did not set. Use it for your own navigation too, and the sidebar, the dashboard cards and the command palette always agree:

```vue
<script setup lang="ts">
const paths = useMongocampPaths()
const { canSeeAdmin } = useMongocampRoles()

const items = computed(() => [
  { label: 'Collections', to: paths.collections },
  ...(canSeeAdmin.value ? [{ label: 'Users', to: paths.users }, { label: 'Roles', to: paths.roles }] : []),
  { label: 'Account', to: paths.account },
])
</script>
```

Links to a single item are built from the base route:

| Page | Link |
|---|---|
| A collection's overview | `${paths.collections}/${name}` |
| A collection's documents | `${paths.collections}/${name}/data` |
| A bucket's files | `${paths.buckets}/${bucket}` |
| A role's grants | `${paths.roles}/${role}` |

A configured value never ends with a slash — a trailing one is removed.

## Related

- [Configuration → Paths](/guide/configuration#paths) — the option, its defaults and which prop falls back to which key
- [`useMongocampRoles`](/composables/use-mongocamp-roles) — `canSeeAdmin` / `canSeeManagement` for what to show
