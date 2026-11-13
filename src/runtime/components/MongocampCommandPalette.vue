<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { defineShortcuts, navigateTo, useI18n, useMongocampPaths } from '#imports'
import useMongocampAdmin from '../composables/useMongocampAdmin'
import { useMongocampJobs } from '../composables/useMongocampJobs'
import { useMongocampPermissions } from '../composables/useMongocampPermissions'
import { useMongocampRoles } from '../composables/useMongocampRoles'
import { buildActions, buildEntries, isFresh } from '../utils/commandPalette'
import type { PaletteData, PaletteEntry, PaletteKind, PalettePaths } from '../utils/commandPalette'

const props = withDefaults(defineProps<{
  /** Keyboard shortcut in Nuxt UI's notation (`meta_k`); empty = no shortcut */
  shortcut?: string
  /** How long loaded lists are reused, in milliseconds */
  cacheMs?: number
  /** Open the page of a chosen entry; false = only emit `select` */
  navigate?: boolean
  collectionPath?: string
  bucketPath?: string
  usersPath?: string
  rolePath?: string
  jobsPath?: string
  settingsPath?: string
  accountPath?: string
}>(), {
  shortcut: 'meta_k',
  cacheMs: 60_000,
  navigate: true,
})

const emit = defineEmits<{
  select: [entry: PaletteEntry]
}>()

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const basePaths = useMongocampPaths()
const { listUsers, listRoles, listCollections } = useMongocampAdmin()
const { listJobs } = useMongocampJobs()
const { canRead, load: loadPermissions } = useMongocampPermissions()
const { isAdmin, logoutPath } = useMongocampRoles()

const data = ref<PaletteData>({})
const loadedAt = ref<number | undefined>(undefined)
const loading = ref(false)
const failed = ref<string[]>([])
let generation = 0

const paths = computed<PalettePaths>(() => ({
  collectionPath: props.collectionPath ?? basePaths.collections,
  bucketPath: props.bucketPath ?? basePaths.buckets,
  usersPath: props.usersPath ?? basePaths.users,
  rolePath: props.rolePath ?? basePaths.roles,
  jobsPath: props.jobsPath ?? basePaths.jobs,
  settingsPath: props.settingsPath ?? basePaths.settings,
  accountPath: props.accountPath ?? basePaths.account,
}))

async function load() {
  const current = ++generation
  loading.value = true
  const admin = isAdmin.value
  const parts = {
    collections: () => listCollections(),
    users: async () => (await listUsers()).map(u => u.user),
    roles: async () => (await listRoles()).map(r => r.name),
    jobs: async () => (await listJobs()).map(j => ({ name: j.name, group: j.group })),
  }
  // everything but the collections is administrators' business
  const wanted = (admin ? ['collections', 'users', 'roles', 'jobs'] : ['collections']) as (keyof typeof parts)[]
  // the server's own answer for the signed-in user's rights (administrators need none); a failure keeps the grants
  const [results] = await Promise.all([Promise.allSettled(wanted.map(key => parts[key]())), admin ? undefined : loadPermissions()])
  if (current !== generation) return
  const next: PaletteData = {}
  const errors: string[] = []
  results.forEach((result, index) => {
    const key = wanted[index]!
    if (result.status === 'fulfilled') (next as Record<string, unknown>)[key] = result.value
    else errors.push(key)
  })
  data.value = next
  failed.value = errors
  loadedAt.value = Date.now()
  loading.value = false
}

watch(open, (isOpen) => {
  if (isOpen && !isFresh(loadedAt.value, Date.now(), props.cacheMs) && !loading.value) load()
})

const GROUP_ORDER: PaletteKind[] = ['collection', 'bucket', 'user', 'role', 'job', 'action']

function choose(entry: PaletteEntry) {
  open.value = false
  emit('select', entry)
  if (entry.action === 'refresh') {
    load()
    return
  }
  if (!props.navigate) return
  if (entry.action === 'logout') navigateTo(logoutPath)
  else if (entry.to) navigateTo(entry.to)
}

const groups = computed(() => {
  const entries = [
    ...buildEntries(data.value, paths.value, { canRead }),
    ...buildActions(paths.value, { isAdmin: isAdmin.value }),
  ]
  return GROUP_ORDER
    .map((kind) => {
      const items = entries.filter(e => e.kind === kind).map(entry => ({
        label: entry.kind === 'action' ? t(`nuxtUiMongocamp.commandPalette.action.${entry.label}`) : entry.label,
        suffix: entry.description,
        icon: entry.icon,
        onSelect: () => choose(entry),
      }))
      return { id: kind, label: t(`nuxtUiMongocamp.commandPalette.group.${kind}`), items }
    })
    .filter(group => group.items.length)
})

defineShortcuts(computed(() => props.shortcut
  ? { [props.shortcut]: { usingInput: true, handler: () => { open.value = !open.value } } }
  : {}))
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('nuxtUiMongocamp.commandPalette.title')"
    :description="t('nuxtUiMongocamp.commandPalette.description')"
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #content>
      <UCommandPalette
        :groups="groups"
        :loading="loading"
        :placeholder="t('nuxtUiMongocamp.commandPalette.placeholder')"
        class="h-96"
        close
        @update:open="open = $event"
      >
        <template #empty>
          <span data-testid="palette-empty">{{ t('nuxtUiMongocamp.commandPalette.empty') }}</span>
        </template>
        <template
          v-if="failed.length"
          #footer
        >
          <p
            class="px-3 py-2 text-xs text-dimmed"
            data-testid="palette-failed"
          >
            {{ t('nuxtUiMongocamp.commandPalette.failed', { parts: failed.join(', ') }) }}
          </p>
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>
