<script setup lang="ts">
import { computed, h, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Grant } from '@sfxcode/nuxt-mongocamp-server'
import { useI18n } from '#imports'

// Read-only list of grants (used by the user and role detail drawers). Editing stays in
// MongocampRoleGrants.
defineProps<{
  grants: Grant[]
}>()

const { t } = useI18n()

const UBadge = resolveComponent('UBadge')

function flag(value: boolean) {
  return h(UBadge, {
    label: value ? t('nuxtUiMongocamp.common.yes') : t('nuxtUiMongocamp.common.no'),
    color: value ? 'success' : 'neutral',
    variant: 'subtle',
  })
}

const columns = computed<TableColumn<Grant>[]>(() => [
  { accessorKey: 'name', header: t('nuxtUiMongocamp.roleGrants.columnCollection') },
  {
    accessorKey: 'grantType',
    header: t('nuxtUiMongocamp.roleGrants.columnType'),
    cell: ({ row }) => h(UBadge, { label: row.original.grantType, color: 'neutral', variant: 'subtle' }),
  },
  { accessorKey: 'read', header: t('nuxtUiMongocamp.roleGrants.columnRead'), cell: ({ row }) => flag(row.original.read) },
  { accessorKey: 'write', header: t('nuxtUiMongocamp.roleGrants.columnWrite'), cell: ({ row }) => flag(row.original.write) },
  { accessorKey: 'administrate', header: t('nuxtUiMongocamp.roleGrants.columnAdmin'), cell: ({ row }) => flag(row.original.administrate) },
])
</script>

<template>
  <UTable
    :data="grants"
    :columns="columns"
  >
    <template #empty>
      <MongocampEmptyState :title="t('nuxtUiMongocamp.empty.grants')" />
    </template>
  </UTable>
</template>
