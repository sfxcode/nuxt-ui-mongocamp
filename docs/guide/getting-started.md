# Getting Started

`@sfxcode/nuxt-ui-mongocamp` is a Nuxt module that wraps [`@sfxcode/nuxt-mongocamp-server`](https://www.npmjs.com/package/@sfxcode/nuxt-mongocamp-server) with ready-made UI components, composables, and a runtime plugin. Add it to your Nuxt app and get MongoCamp authentication, user/role management, and collection browsing out of the box — built on [Nuxt UI](https://ui.nuxt.com) and [FormKit](https://formkit.com).

## Installation

::: code-group

```bash [pnpm]
pnpm add @sfxcode/nuxt-ui-mongocamp
```

```bash [npm]
npm install @sfxcode/nuxt-ui-mongocamp
```

```bash [yarn]
yarn add @sfxcode/nuxt-ui-mongocamp
```

:::

Add the module to `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@sfxcode/nuxt-ui-mongocamp'],

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
| [`@nuxtjs/i18n`](https://i18n.nuxtjs.org) | English and German texts of the module's components (default locale `en`) |

## Forms work without setup

The module's dialogs are FormKit forms built from Nuxt UI inputs. Two things they need are set up for you:

- **A FormKit config** with the Nuxt UI input types (`nuxtUIInput`, `nuxtUISwitch`, `nuxtUIListbox`, `nuxtUISelectMenu`, the repeater, …) and the asterisk on required fields. It is used when your app has no `formkit.config.ts` (or `.mjs` / `.js`) of its own.
- **Default styles** for FormKit's label, help text, validation message and form spacing, built on Nuxt UI's colour tokens so they follow your theme. They load before your own stylesheets — any rule of yours wins — and `nuxtUiMongocamp: { formkitStyles: false }` switches them off.

### Your own FormKit config

A `formkit.config.ts` in your app's root replaces the module's default completely. Register the inputs yourself, then add what you need:

```ts
// formkit.config.ts
import type { DefaultConfigOptions } from '@formkit/vue'
import { de, en } from '@formkit/i18n'
import { nuxtUIInputs, nuxtUIOutputs } from '@sfxcode/nuxt-ui-formkit/definitions'
import { addNuxtAsteriskPlugin } from '@sfxcode/nuxt-ui-formkit/plugins'

const config: DefaultConfigOptions = {
  locales: { en, de },
  locale: 'en',
  inputs: { ...nuxtUIInputs, ...nuxtUIOutputs }, // required by the module's forms
  iconLoader: () => undefined,
  plugins: [addNuxtAsteriskPlugin],
}

export default config
```

Without the `inputs` line the first dialog fails with FormKit error 600 (unknown input type).

If the dev server reloads the page the first time a form opens, Vite is optimising the FormKit packages late. Listing them avoids that; it is optional:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  vite: { optimizeDeps: { include: ['@formkit/core', '@formkit/i18n', '@formkit/addons'] } },
})
```

## Languages

The components speak English and German and follow `@nuxtjs/i18n`'s current locale; your own locale files merge with the module's (its keys live under `nuxtUiMongocamp`). If you use [route protection](/guide/route-protection), set `i18n: { strategy: 'no_prefix' }` — with a `/de/...` prefix the protected-route patterns would no longer match.

## The server must allow your origin

In the default (login) mode the browser talks to the MongoCamp server directly, so the server's CORS settings have to allow your app's origin — including the port during development. An app on a port the server does not list loads, but every request fails with a CORS error in the browser console. [Server proxy mode](/guide/server-proxy-auth) avoids this: the browser then only talks to your own Nuxt server.

## Building a login page

```vue
<template>
  <MongocampLogin redirect-path="/secured" />
</template>
```

On success this redirects to `redirectPath` (default `/`) and persists the last user ID in a cookie. Route protection itself is opt-in and config-driven — see [Route Protection](/guide/route-protection) for how to guard `/secured/**` and similar paths.

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

See [Components](/components/) for the full list and [Composables](/composables/) for the underlying building blocks. [Building an admin app](/guide/admin-app) shows how the pieces become a complete console.
