# MongocampJobs

Full CRUD table for scheduled background jobs — list, register, edit, execute-now, and delete. Mirrors the shape of [`MongocampRoles`](/components/mongocamp-roles): a list with add/edit modals and a delete confirmation.

## Usage

```vue
<template>
  <MongocampJobs />
</template>
```

## Props

None — the job list is global, not scoped to a collection or role.

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
- **Delete** — confirmation modal before calling `deleteJob`.

## Related composables

- [`useMongocampJobs`](/composables/use-mongocamp-jobs)
