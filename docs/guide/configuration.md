# Configuration

## Module options

The module's own config key is `nuxtUiMongocamp` — it currently exposes no options of its own:

```ts
export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-ui-mongocamp',
    configKey: 'nuxtUiMongocamp',
    compatibility: { nuxt: '>=3.16.0' },
  },
  defaults: {},
  // ...
})
```

All configuration happens under the `mongocamp` key, which is forwarded to `@sfxcode/nuxt-mongocamp-server` (declared as a `moduleDependency`):

```ts
export default defineNuxtConfig({
  modules: ['nuxt-ui-mongocamp'],

  mongocamp: {
    url: 'https://your-mongocamp-server',
    paginationSize: 500,          // default: 500
    refreshToken: true,           // default: true
    tokenRefreshIntervall: 5000,  // ms, default: 5000
  },
})
```

| Option | Default | Description |
|---|---|---|
| `url` | — | Base URL of your MongoCamp server. Required. |
| `paginationSize` | `500` | Default page size for paginated API calls. |
| `refreshToken` | `true` | Whether the auth token is refreshed automatically. |
| `tokenRefreshIntervall` | `5000` | Refresh interval in milliseconds. |

## Environment variables (playground / local dev)

The playground app reads these from `.env`:

```bash
MONGOCAMP_URL=https://your-mongocamp-server
MONGOCAMP_ADMIN_USER=admin
MONGOCAMP_ADMIN_PASSWORD=changeme
```

## Runtime plugin

The module's runtime plugin runs on app boot:

1. Fetches the MongoCamp server version via `informationApi.version()` and provides it as `$mongocampVersion`.
2. Registers the global route middleware described in [Route Protection](/guide/route-protection).

```ts
const { $mongocampVersion } = useNuxtApp()
// $mongocampVersion.value?.name
// $mongocampVersion.value?.version
```

Use the [`<MongocampVersion />`](/components/mongocamp-version) component to render this directly.
