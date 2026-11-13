# MongocampPermissionMatrix

Who may do what: **users × collections**, worked out from the roles' grants the way the server does. Read-only — grants are edited per role in [`MongocampRoleGrants`](/components/mongocamp-role-grants). Admin-only data (the user and role lists need an administrator).

## Usage

```vue
<template>
  <MongocampPermissionMatrix grants-path="/admin/roles" />
</template>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `grantsPath` | `string` | `/secured/admin/roles` | Base path of a role's grant page; the role chips link to `<grantsPath>/<role>` (as in [`MongocampRoles`](/components/mongocamp-roles)) |
| `maxCollections` | `number` | `60` | At most this many collections (columns) are drawn; the note says how many were cut |
| `maxUsers` | `number` | `200` | The same for users (rows) |
| `hideHeading` | `boolean` | `false` | Hide the component's own heading, e.g. when the page around it already shows a title. The toolbar stays. The subtitle goes with it. |
| `hideRefresh` | `boolean` | `false` | Hide the component's own reload button, e.g. when the page calls the exposed `refresh()` from its own header. |

## In a page with its own header

The component can hand its toolbar to the page around it:

- **`refresh()`** is exposed — call it through a template ref from your own reload button, and set `hideRefresh` to drop the built-in one.
- **`toolbar` slot** — your own buttons, placed beside the built-in ones.

```vue
<script setup lang="ts">
const list = useTemplateRef<{ refresh: () => void }>('list')
</script>

<template>
  <header>
    <h1>My title</h1>
    <UButton icon="i-lucide-refresh-cw" @click="list?.refresh()" />
  </header>
  <MongocampPermissionMatrix ref="list" hide-heading hide-refresh>
    <template #toolbar>
      <UButton>Mine</UButton>
    </template>
  </MongocampPermissionMatrix>
</template>
```

## Reading the matrix

Each cell shows **`R W A`** — read, write, administrate — with `·` for what is missing: `R··` is read only, `RW·` read and write, `RWA` everything, `···` no access, **`admin`** an administrator (everything is allowed whatever the grants say). `?` means *not known*. The letters carry the meaning, colour only supports it, and every cell has a title and screen-reader text (*read, write — via reader, writer*).

A user row shows its roles as links to their grant pages, an **Admin** badge, and flags a role that no longer exists (its grants cannot count).

## The rule it follows

Verified live on server 1.6.3 with a throwaway non-admin user (plan 17, phase 5):

- a user's effective grants are the **union of the collection grants of its roles** (plus any grant listed with the user itself);
- a grant's name matches a collection **exactly but ignoring case** — there are no wildcards;
- `read`, `write` and `administrate` are **independent** (none implies another);
- a user is an **administrator** if the user or any of its roles is flagged admin;
- grants take effect **immediately** on the server, so the matrix is what the server enforces now.

MongoCamp's own `mc_*` collections are left out. The grants of a GridFS bucket's `.files` and `.chunks` parts were never verified, so they show as `?` for non-administrators (a note says so).

## Filters and views

- A **text filter**: a text that names users narrows the rows, one that names collections narrows the columns.
- A **role** select: only the users that have that role.
- **Quick views** with counts: *Users without a role*, *Collections nobody can write*, *Collections nobody can read* (administrators can always do everything and are not counted; bucket parts are never listed).
- **Swap rows and columns**: collections as rows, users as columns.
- **Export CSV**: what is shown, one row per user — `user`, `roles` and one column per collection with `R`, `RW`, `RWA`, `admin`, empty for nothing, `?` for unknown.
