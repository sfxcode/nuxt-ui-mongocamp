# MongocampCommandPalette

"Go to…" palette (Nuxt UI's `UCommandPalette` in a modal): type a few letters, press Enter, land on the page. Opens with **⌘K / Ctrl+K** by default.

```vue
<MongocampCommandPalette />
<!-- or controlled -->
<MongocampCommandPalette v-model:open="open" shortcut="meta_j" @select="onSelect" />
```

Put it once in a layout that only logged-in users see.

::: tip In development
Nuxt DevTools also answers ⌘K / Ctrl+K and opens its own palette on top of this one. Press Esc to close it, or give this palette another `shortcut` (for example `meta_shift_k`) while developing.
:::

## Props

| Prop | Default | Description |
|---|---|---|
| `v-model:open` | `false` | Palette state |
| `shortcut` | `'meta_k'` | Nuxt UI shortcut notation; `''` = none |
| `cacheMs` | `60000` | How long loaded lists are reused |
| `navigate` | `true` | `false` = only emit `select` |
| `collectionPath` | `/secured/admin/collections` | Opens `<path>/<name>/data` |
| `bucketPath` | `/secured/admin/buckets` | Opens `<path>/<bucket>` |
| `usersPath`, `rolePath`, `jobsPath` | `/secured/admin/users`, `/roles`, `/jobs` | Role opens `<rolePath>/<name>` (grants page) |
| `settingsPath`, `accountPath` | `/secured/admin/settings`, `/secured/account` | Actions |

Emits `select(entry)` for every choice (`{ id, kind, label, to?, action? }`).

## Behaviour

- **Nothing is requested until the first open.** Lists are then cached for `cacheMs`; the **Refresh this list** action reloads them.
- Administrators get collections, buckets (a `<name>.files` collection), users, roles and jobs; everyone else only the collections they may read (`useMongocampPermissions`, fail-open). `mc_*` collections and GridFS halves never show as collections.
- Actions: open my account, open server settings (admins), refresh, log out (goes to the module's `logoutPath`).
- The sources load independently: a failing one is named at the bottom ("Not loaded: jobs") and the rest stays usable.
- Users have no page of their own, so choosing one opens the users list.

Pure helpers: `utils/commandPalette.ts` (`buildEntries`, `buildActions`, `isFresh`).
