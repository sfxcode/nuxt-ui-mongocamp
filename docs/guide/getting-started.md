# Getting Started

`nuxt-ui-mongocamp` is a Nuxt module that wraps [`@sfxcode/nuxt-mongocamp-server`](https://www.npmjs.com/package/@sfxcode/nuxt-mongocamp-server) with ready-made UI components, composables, and a runtime plugin. Add it to your Nuxt app and get MongoCamp authentication, user/role management, and collection browsing out of the box — built on [Nuxt UI](https://ui.nuxt.com) and [FormKit](https://formkit.com).

## Installation

::: code-group

```bash [pnpm]
pnpm add nuxt-ui-mongocamp
```

```bash [npm]
npm install nuxt-ui-mongocamp
```

```bash [yarn]
yarn add nuxt-ui-mongocamp
```

:::

Add the module to `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['nuxt-ui-mongocamp'],

  mongocamp: {
    url: process.env.MONGOCAMP_URL,
  },
})
```

The `mongocamp` key is forwarded to `@sfxcode/nuxt-mongocamp-server` — see [Configuration](/guide/configuration) for the full option list.

Set the required environment variables in `.env`:

```bash
MONGOCAMP_URL=https://your-mongocamp-server
MONGOCAMP_ADMIN_USER=admin
MONGOCAMP_ADMIN_PASSWORD=changeme
```

## Module dependencies

These modules are declared as `moduleDependencies` and are set up automatically — you do not need to add them to `nuxt.config.ts` yourself:

| Module | Purpose |
|---|---|
| [`@nuxt/ui`](https://ui.nuxt.com) | Component library (`UTable`, `UModal`, `UBadge`, `UCard`, …) |
| [`unocss-nuxt-ui`](https://www.npmjs.com/package/unocss-nuxt-ui) | UnoCSS preset matching Nuxt UI's design tokens |
| [`@formkit/nuxt`](https://formkit.com/getting-started/installation#with-nuxt) | FormKit core integration for Nuxt |
| [`@sfxcode/nuxt-ui-formkit`](https://www.npmjs.com/package/@sfxcode/nuxt-ui-formkit) | Nuxt UI input types for FormKit (`nuxtUIInput`, `nuxtUISwitch`, `nuxtUIListbox`, `nuxtUISelectMenu`) |
| [`@sfxcode/nuxt-mongocamp-server`](https://www.npmjs.com/package/@sfxcode/nuxt-mongocamp-server) | MongoCamp REST API client, auth state, and `useMongocampApi()` / `useMongocampAuth()` composables |

## Building a login page

```vue
<template>
  <MongocampLogin />
</template>
```

On success this redirects to `/secured` and persists the last user ID in a cookie. Route protection itself is opt-in and config-driven — see [Route Protection](/guide/route-protection) for how to guard `/secured/**` and similar paths.

## Building an admin dashboard

Compose the collection components into an admin page:

```vue
<script setup lang="ts">
const route = useRoute()
const collectionName = route.params.collection_name as string
</script>

<template>
  <div class="flex flex-col gap-6">
    <MongocampCollections />
    <MongocampCollectionInfos :collection-name="collectionName" />
    <MongocampCollectionData :collection-name="collectionName" />
  </div>
</template>
```

See [Components](/components/) for the full list and [Composables](/composables/) for the underlying building blocks.
