<script setup lang="ts">
import { computed, h, ref, resolveComponent, watch } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import { useI18n, useMongocampRoles, useMongocampSystem } from '#imports'
import type { ServerPlugins } from '../composables/useMongocampSystem'
import { MASKED_VALUE } from '../utils/configRows'
import type { ConfigRow } from '../utils/configRows'

const PAGE_SIZE = 10

const { t } = useI18n()
const { getSettings, listConfigurations } = useMongocampSystem()
const { isAdmin } = useMongocampRoles()

// Read-only on purpose: there is no way to change a setting or stop the server from here, and secret values
// arrive already masked (see utils/configRows.ts) — nothing here can show or search them.
const configurations = ref<ConfigRow[]>([])
const plugins = ref<ServerPlugins | null>(null)
const loading = ref(false)
const loadError = ref<unknown>(null)
const search = ref('')
const page = ref(1)

async function fetchSettings() {
  if (!isAdmin.value) return
  loading.value = true
  loadError.value = null
  try {
    const [loadedPlugins, rows] = await Promise.all([getSettings(), listConfigurations()])
    plugins.value = loadedPlugins
    configurations.value = rows
  }
  catch (e: unknown) {
    loadError.value = e
    plugins.value = null
    configurations.value = []
  }
  finally {
    loading.value = false
  }
}

const filteredRows = computed(() => {
  const needle = search.value.trim().toLowerCase()
  if (!needle) return configurations.value
  return configurations.value.filter(row =>
    [row.key, row.value, row.comment, row.configType].some(text => text.toLowerCase().includes(needle)),
  )
})

const pageRows = computed(() => filteredRows.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

// a new search or a reload may leave the current page past the end
watch(() => filteredRows.value.length, () => {
  page.value = 1
})

const UBadge = resolveComponent('UBadge')

const columns = computed<TableColumn<ConfigRow>[]>(() => [
  {
    accessorKey: 'key',
    header: t('nuxtUiMongocamp.settings.columnKey'),
    cell: ({ row }) => h('div', { class: 'flex flex-col' }, [
      h('span', { class: 'font-mono text-xs' }, row.original.key),
      row.original.comment ? h('span', { class: 'text-xs text-dimmed' }, row.original.comment) : null,
    ]),
  },
  {
    accessorKey: 'value',
    header: t('nuxtUiMongocamp.settings.columnValue'),
    cell: ({ row }) => row.original.masked
      ? h(UBadge, { label: MASKED_VALUE, color: 'neutral', variant: 'subtle', title: t('nuxtUiMongocamp.settings.maskedHint') })
      : h('span', { class: 'font-mono text-xs break-all' }, row.original.value),
  },
  { accessorKey: 'configType', header: t('nuxtUiMongocamp.settings.columnType') },
  {
    accessorKey: 'needsRestart',
    header: t('nuxtUiMongocamp.settings.columnRestart'),
    cell: ({ row }) => row.original.needsRestart
      ? h(UBadge, { label: t('nuxtUiMongocamp.settings.restartNeeded'), color: 'warning', variant: 'subtle' })
      : h('span', { class: 'text-dimmed' }, '—'),
  },
])

const pluginGroups = computed(() => [
  { key: 'routes', label: t('nuxtUiMongocamp.settings.routesPlugins'), items: plugins.value?.routesPlugins ?? [] },
  { key: 'file', label: t('nuxtUiMongocamp.settings.filePlugins'), items: plugins.value?.filePlugins ?? [] },
  { key: 'ignored', label: t('nuxtUiMongocamp.settings.ignoredPlugins'), items: plugins.value?.ignoredPlugins ?? [] },
])

fetchSettings()
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <h2 class="text-xl font-semibold">
        {{ t('nuxtUiMongocamp.settings.heading') }}
      </h2>
      <UTooltip
        v-if="isAdmin"
        :text="t('nuxtUiMongocamp.common.refresh')"
      >
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          :loading="loading"
          :aria-label="t('nuxtUiMongocamp.common.refresh')"
          @click="fetchSettings"
        />
      </UTooltip>
    </div>

    <UAlert
      v-if="!isAdmin"
      color="neutral"
      variant="subtle"
      icon="i-lucide-lock"
      :description="t('nuxtUiMongocamp.settings.adminOnly')"
    />

    <template v-else>
      <MongocampErrorAlert
        :error="loadError"
        :title="t('nuxtUiMongocamp.settings.loadFailedTitle')"
        @retry="fetchSettings"
      />

      <UCard v-if="plugins">
        <template #header>
          <span class="font-semibold">{{ t('nuxtUiMongocamp.settings.pluginsHeading') }}</span>
        </template>
        <div class="grid gap-4 sm:grid-cols-3">
          <section
            v-for="group in pluginGroups"
            :key="group.key"
            class="flex flex-col gap-1"
          >
            <h3 class="text-sm font-semibold">
              {{ group.label }}
            </h3>
            <div
              v-if="group.items.length"
              class="flex flex-wrap gap-1"
            >
              <UBadge
                v-for="item in group.items"
                :key="item"
                :label="item"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </div>
            <p
              v-else
              class="text-sm text-dimmed"
            >
              {{ t('nuxtUiMongocamp.settings.noPlugins') }}
            </p>
          </section>
        </div>
      </UCard>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :placeholder="t('nuxtUiMongocamp.settings.searchPlaceholder')"
          size="sm"
          class="w-full max-w-xs"
        />
        <p class="text-xs text-dimmed">
          {{ t('nuxtUiMongocamp.settings.maskedNote') }}
        </p>
      </div>

      <UTable
        :data="pageRows"
        :columns="columns"
        :loading="loading"
      >
        <template #empty>
          <MongocampEmptyState :title="t('nuxtUiMongocamp.settings.empty')" />
        </template>
      </UTable>

      <div
        v-if="filteredRows.length > PAGE_SIZE"
        class="flex justify-end"
      >
        <UPagination
          v-model:page="page"
          :total="filteredRows.length"
          :items-per-page="PAGE_SIZE"
        />
      </div>
    </template>
  </div>
</template>
