# Building an admin app

The module owns no routes or pages: you decide where each component lives. Where the components link to each other they use the module option [`paths`](/guide/configuration#paths) — set it once if your routes differ from the playground's `/secured/admin/...`; a `*Path` prop overrides it for one component. The playground is the reference wiring; this page lists the pieces.

## Pages

| Page | Component | Path props that link onward (default: `paths`) |
|---|---|---|
| Collections | `MongocampCollections` | `infoPath`, `dataPath`, `bucketFilesPath` |
| Collection → Data | `MongocampCollectionData` | `infoPath`, `aggregatePath` (adds the link that carries the table's filter to the Aggregate page) |
| Collection → Overview | `MongocampCollectionInfos` (stats, indexes, schema, distribution) | — |
| Collection → Aggregate | `MongocampAggregationBuilder` | — |
| Bucket | `MongocampBucketFiles` | — |
| Users / Roles / Role grants | `MongocampUsers`, `MongocampRoles` (`grantsPath`), `MongocampRoleGrants` | — |
| Permissions | `MongocampPermissionMatrix` | `grantsPath` |
| Server overview | `MongocampServerOverview` | `infoPath`, `dataPath`, `jobsPath` |
| Dashboard | `MongocampDashboard` | `collectionsPath`, `usersPath`, `rolesPath` |
| Server status | `MongocampServerInfo` | — |
| Jobs, Databases, Settings, Account | `MongocampJobs`, `MongocampDatabases`, `MongocampSettings`, `MongocampAccount` | — |

The shell around the pages is yours, but its data is ready: [`useMongocampNavigation()`](/composables/use-mongocamp-navigation) for the sidebar menu, [`useMongocampBreadcrumbs()`](/composables/use-mongocamp-breadcrumbs) for the page header, [`useMongocampCollectionNames()`](/composables/use-mongocamp-collection-names) for a collection list, [`MongocampServerStatus`](/components/mongocamp-server-status) for the foot of the sidebar and [`MongocampUserAccess`](/components/mongocamp-user-access) as the landing page of users who are not administrators.

Add one [`MongocampCommandPalette`](/components/mongocamp-command-palette) to the layout (⌘K) and the pages are reachable from anywhere.

## The glue the playground keeps

Three small pieces, all in `playground/app/`:

- `components/CollectionTabs.vue` — the collection name and **Data | Overview | Aggregate** tabs (`UNavigationMenu` with the three routes under `/secured/admin/collections/<name>`).
- `components/CollectionSidebar.vue` — one `listCollections()` request, grouped as **Collections**, **Buckets** (`<name>.files`) and **MongoCamp** (`mc_*`).
- `layouts/collection.vue` — the default frame plus the sidebar and the palette; collection and bucket pages choose it with `definePageMeta({ layout: 'collection' })`.

That is the whole "shell". It is deliberately not a module component: it is about forty lines of routing choices that differ per app (URL scheme, which tabs, which sidebar groups), so shipping it would only add props that mirror what a layout already expresses. If your app repeats more glue than this, wrap it in your own component.

## A page with its own header

The components come with a heading and a reload button. A console that has its own page header can take both over:

| What | How |
|---|---|
| Your own title | `hide-heading` — on every list component, the dashboard, settings, server status and the login form |
| Your own reload button | `hide-refresh`, and call the exposed `refresh()` through a template ref |
| Your own buttons beside the built-in ones | the `toolbar` slot |
| Reload something else after a write | the `changed` event (users, roles, grants, jobs, documents, files, collections) |

```vue
<script setup lang="ts">
const list = useTemplateRef<{ refresh: () => unknown }>('list')
</script>

<template>
  <header class="flex items-center justify-between">
    <h1>Users</h1>
    <UButton icon="i-lucide-refresh-cw" aria-label="Reload" @click="list?.refresh()" />
  </header>
  <MongocampUsers ref="list" hide-heading hide-refresh />
</template>
```

Each component's page lists what it supports under *In a page with its own header*.

## Giving it your own look

The components are built from Nuxt UI components and use only its semantic classes, so a theme is three files in your app and nothing in the module.

**1. Colours and fonts** — a stylesheet (register it under `css` in `nuxt.config.ts`). A custom colour is eleven CSS variables; no UnoCSS or Tailwind config is needed:

```css
:root {
  --font-sans: 'Schibsted Grotesk', ui-sans-serif, system-ui, sans-serif;

  --color-lake-50: oklch(97% 0.015 205);
  /* … 100 to 900 … */
  --color-lake-950: oklch(22% 0.035 214);
}

/* which step is the action colour, and the surfaces, per theme */
:root, .light { --ui-primary: var(--ui-color-primary-600); --ui-bg: var(--ui-color-neutral-50); }
.dark { --ui-primary: var(--ui-color-primary-400); --ui-bg: var(--ui-color-neutral-950); }
```

Fonts named in `--font-sans` / `--font-mono` are downloaded and self-hosted by `@nuxt/fonts` (part of Nuxt UI) once `fonts: { processCSSVariables: true }` is set in `nuxt.config.ts`. The chart colours are `--ui-chart-1` … `--ui-chart-6`; redefine them per theme if your primary colour is too muted for a chart.

**2. Component shapes** — `app/app.config.ts` maps the scale onto Nuxt UI's colours and restyles its components everywhere, including inside the module's:

```ts
export default defineAppConfig({
  ui: {
    colors: { primary: 'lake', neutral: 'stone' },
    table: { slots: { thead: 'bg-muted', th: 'px-3 py-1.5 text-sm font-medium text-muted', td: 'px-3 py-2 text-sm' } },
    card: { slots: { root: 'rounded-md shadow-none', body: 'p-4 sm:p-4' } },
  },
})
```

Pick `color` values for badges and buttons from the seven semantic names only (`primary`, `secondary`, `success`, `info`, `warning`, `error`, `neutral`).

**3. The shell** — Nuxt UI's dashboard components work as the frame: `UDashboardGroup` with a `UDashboardSidebar` (navigation from [`useMongocampRoles`](/composables/use-mongocamp-roles)) and one `UDashboardPanel` per page whose `UDashboardNavbar` holds the breadcrumb and the page's buttons. Put the breadcrumb in the navbar's `#left` slot — its `#title` slot is an `h1`, and the page heading should be the only one.

One thing to avoid: `font-variant-numeric: tabular-nums` on whole tables. Some typefaces then also widen the punctuation next to figures and pull apart e-mail addresses and dates. The module already sets tabular figures on the numbers themselves.
