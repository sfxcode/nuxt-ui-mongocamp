# MongocampJobs

Full CRUD table for scheduled background jobs — list, register, edit, execute-now, and delete. Mirrors the shape of [`MongocampRoles`](/components/mongocamp-roles): a list with add/edit modals and a delete confirmation.

## Usage

```vue
<template>
  <MongocampJobs />
</template>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `autoRefresh` | `number` | `0` | Reloads every N seconds (at least 1; `0` = off, the default) through [`useMongocampAutoRefresh`](/composables/use-mongocamp-auto-refresh): pauses while the tab is hidden, never overlaps a running load and slows down after failures. A failed background reload keeps what is on screen and shows the error banner. |
| `hideHeading` | `boolean` | `false` | Hide the component's own heading, e.g. when the page around it already shows a title. The toolbar stays. |
| `hideRefresh` | `boolean` | `false` | Hide the component's own reload button, e.g. when the page calls the exposed `refresh()` from its own header. |

The job list is global, not scoped to a collection or role.

## In a page with its own header

The component can hand its toolbar to the page around it:

- **`refresh()`** is exposed — call it through a template ref from your own reload button, and set `hideRefresh` to drop the built-in one.
- **`toolbar` slot** — your own buttons, placed beside the built-in ones.
- **`changed` event** — emitted after a job was added, edited or deleted, once the component has reloaded. Never on a failed or cancelled action, never on a plain reload.

```vue
<script setup lang="ts">
const list = useTemplateRef<{ refresh: () => void }>('list')
</script>

<template>
  <header>
    <h1>My title</h1>
    <UButton icon="i-lucide-refresh-cw" @click="list?.refresh()" />
  </header>
  <MongocampJobs ref="list" hide-heading hide-refresh @changed="reloadOtherLists">
    <template #toolbar>
      <UButton>Mine</UButton>
    </template>
  </MongocampJobs>
</template>
```

## Columns

| Column | Description |
|---|---|
| Name | Sortable |
| Group | Sortable |
| Cron Expression | Monospaced |
| Next Fire Time | Formatted from `nextScheduledFireTime`; shows "—" if unset |
| Priority | Sortable |
| — | Execute now / edit / delete action buttons |

## Behavior

- **List** — fetched via [`useMongocampJobs`](/composables/use-mongocamp-jobs)`.listJobs()`.
- **Add** — the "Job Class" field is a select populated from `listPossibleJobs()`, fetched fresh every time the Add modal opens (not once at mount) so the option list can't go stale.
- **Edit** — the form omits the Job Class field entirely (the implementation class isn't expected to change after registration); the original `jobGroup`/`jobName` are kept separately from the editable `name`/`group` fields so `updateJob(originalGroup, originalName, jobConfig)` still identifies the right job even if you rename it or move it to a different group.
- **Execute now** — triggers the job immediately via `executeJob`; shows a success/error toast (the UI can't observe the job's actual side effect, only whether the API call succeeded).
- **Paging** — 25 rows a page with a pager below the table once there are more. The table pages its *sorted* rows, so a header sort orders the whole list. A shorter list after a delete never leaves you past the last page.
- **Delete** — confirmation modal before calling `deleteJob`. If the server refuses, the dialog stays open and shows why so you can try again or cancel; the list is only reloaded after a successful delete.

## Related composables

- [`useMongocampJobs`](/composables/use-mongocamp-jobs)
