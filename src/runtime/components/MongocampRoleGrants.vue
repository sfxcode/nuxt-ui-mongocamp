<script setup lang='ts'>
import { computed, h, reactive, ref, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Grant } from '@sfxcode/nuxt-mongocamp-server'
import { useI18n, useMongocampError } from '#imports'
import useMongocampAdmin from '../composables/useMongocampAdmin'

const props = defineProps<{
  roleName: string
}>()

const { t } = useI18n()
const { describeError } = useMongocampError()
const { listRoles, updateRole, listCollections } = useMongocampAdmin()

const grants = ref<Grant[]>([])
const allCollections = ref<string[]>([])
const isAdmin = ref(false)
const loading = ref(false)
const isAddModalOpen = ref(false)
const isEditModalOpen = ref(false)
// why the last save failed; cleared by the next save, reload or dialog open
const saveError = ref('')
const saving = ref(false)
const editIndex = ref(-1)
const editGrantName = ref('')

const newGrant = ref({ collectionName: '', read: false, write: false, administrate: false })
const editGrant = ref({ read: false, write: false, administrate: false })

const addGrantSchema = reactive([
  {
    $formkit: 'nuxtUISelectMenu',
    name: 'collectionName',
    label: t('nuxtUiMongocamp.roleGrants.collection'),
    class: 'w-full',
    options: [] as string[],
    validation: 'required',
  },
  {
    $formkit: 'nuxtUISwitch',
    name: 'read',
    label: t('nuxtUiMongocamp.roleGrants.read'),
  },
  {
    $formkit: 'nuxtUISwitch',
    name: 'write',
    label: t('nuxtUiMongocamp.roleGrants.write'),
  },
  {
    $formkit: 'nuxtUISwitch',
    name: 'administrate',
    label: t('nuxtUiMongocamp.roleGrants.administrate'),
  },
])

const editGrantSchema = reactive([
  {
    $formkit: 'nuxtUISwitch',
    name: 'read',
    label: t('nuxtUiMongocamp.roleGrants.read'),
  },
  {
    $formkit: 'nuxtUISwitch',
    name: 'write',
    label: t('nuxtUiMongocamp.roleGrants.write'),
  },
  {
    $formkit: 'nuxtUISwitch',
    name: 'administrate',
    label: t('nuxtUiMongocamp.roleGrants.administrate'),
  },
])

const loadError = ref<unknown>(null)

async function fetchRole() {
  loading.value = true
  loadError.value = null
  saveError.value = ''
  try {
    const roles = await listRoles()
    const role = roles.find(r => r.name === props.roleName)
    if (role) {
      isAdmin.value = role.isAdmin
      grants.value = (role.collectionGrants ?? []).map(g => ({ ...g }))
    }
  }
  catch (e: unknown) {
    loadError.value = e
    grants.value = []
  }
  finally {
    loading.value = false
  }
}

async function fetchCollections() {
  allCollections.value = await listCollections()
}

// Saves `next` as the role's complete grant list (updateRole replaces it). Callers pass a modified *copy*:
// the table (`grants`) is only touched by the reload after a confirmed save, so a refusal leaves it showing
// what the server really has instead of a change that never happened. Returns whether the save worked.
async function saveGrants(next: Grant[]): Promise<boolean> {
  if (saving.value) return false
  saving.value = true
  saveError.value = ''
  try {
    await updateRole(props.roleName, isAdmin.value, next)
  }
  catch (e: unknown) {
    saveError.value = describeError(e, 'nuxtUiMongocamp.roleGrants.errorSave').message
    return false
  }
  finally {
    saving.value = false
  }
  await fetchRole()
  return true
}

async function handleAddGrant() {
  const raw = newGrant.value.collectionName as unknown as { value?: string, label?: string }
  const collectionName = typeof newGrant.value.collectionName === 'object'
    ? raw.value ?? raw.label ?? ''
    : newGrant.value.collectionName
  const next: Grant[] = [...grants.value, {
    name: collectionName,
    read: newGrant.value.read,
    write: newGrant.value.write,
    administrate: newGrant.value.administrate,
    grantType: 'COLLECTION',
  }]
  // on a refusal the dialog stays open, with the reason, so the input isn't lost
  if (await saveGrants(next)) isAddModalOpen.value = false
}

function openEdit(index: number) {
  const grant = grants.value[index]!
  editIndex.value = index
  saveError.value = ''
  editGrantName.value = grant.name
  editGrant.value = { read: grant.read, write: grant.write, administrate: grant.administrate }
  isEditModalOpen.value = true
}

async function handleEditGrant() {
  const next = grants.value.map((grant, index) => index === editIndex.value
    ? { ...grant, read: editGrant.value.read, write: editGrant.value.write, administrate: editGrant.value.administrate }
    : grant)
  if (await saveGrants(next)) isEditModalOpen.value = false
}

async function removeGrant(index: number) {
  await saveGrants(grants.value.filter((_, i) => i !== index))
}

// collections without a grant yet, minus MongoCamp's own `mc_` tables
const missingReadCollections = computed(() => {
  const grantedNames = new Set(grants.value.map(g => g.name))
  return allCollections.value.filter(c => !c.startsWith('mc_') && !grantedNames.has(c))
})

async function addAllReadGrants() {
  const added: Grant[] = missingReadCollections.value.map(name => ({
    name,
    read: true,
    write: false,
    administrate: false,
    grantType: 'COLLECTION',
  }))
  if (!added.length) return
  await saveGrants([...grants.value, ...added])
}

function openAdd() {
  const grantedNames = new Set(grants.value.map(g => g.name))
  addGrantSchema[0]!.options = allCollections.value.filter(c => !grantedNames.has(c))
  newGrant.value = { collectionName: '', read: false, write: false, administrate: false }
  saveError.value = ''
  isAddModalOpen.value = true
}

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UTooltip = resolveComponent('UTooltip')

function withTooltip(text: string, node: ReturnType<typeof h>) {
  return h(UTooltip, { text }, { default: () => node })
}

const columns = computed<TableColumn<Grant>[]>(() => [
  {
    accessorKey: 'name',
    header: t('nuxtUiMongocamp.roleGrants.columnCollection'),
  },
  {
    accessorKey: 'grantType',
    header: t('nuxtUiMongocamp.roleGrants.columnType'),
    cell: ({ row }) =>
      h(UBadge, {
        label: row.original.grantType,
        color: 'neutral',
        variant: 'subtle',
      }),
  },
  {
    accessorKey: 'read',
    header: t('nuxtUiMongocamp.roleGrants.columnRead'),
    cell: ({ row }) =>
      h(UBadge, {
        label: row.original.read ? t('nuxtUiMongocamp.common.yes') : t('nuxtUiMongocamp.common.no'),
        color: row.original.read ? 'success' : 'neutral',
        variant: 'subtle',
      }),
  },
  {
    accessorKey: 'write',
    header: t('nuxtUiMongocamp.roleGrants.columnWrite'),
    cell: ({ row }) =>
      h(UBadge, {
        label: row.original.write ? t('nuxtUiMongocamp.common.yes') : t('nuxtUiMongocamp.common.no'),
        color: row.original.write ? 'success' : 'neutral',
        variant: 'subtle',
      }),
  },
  {
    accessorKey: 'administrate',
    header: t('nuxtUiMongocamp.roleGrants.columnAdmin'),
    cell: ({ row }) =>
      h(UBadge, {
        label: row.original.administrate ? t('nuxtUiMongocamp.common.yes') : t('nuxtUiMongocamp.common.no'),
        color: row.original.administrate ? 'error' : 'neutral',
        variant: 'subtle',
      }),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) =>
      h('div', { class: 'flex gap-1 justify-end' }, [
        withTooltip(t('nuxtUiMongocamp.roleGrants.editGrantTooltip'), h(UButton, {
          'icon': 'i-lucide-pencil',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': t('nuxtUiMongocamp.roleGrants.editGrantTooltip'),
          'disabled': saving.value,
          'onClick': () => openEdit(row.index),
        })),
        withTooltip(t('nuxtUiMongocamp.roleGrants.removeGrantTooltip'), h(UButton, {
          'icon': 'i-lucide-trash-2',
          'color': 'error',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': t('nuxtUiMongocamp.roleGrants.removeGrantTooltip'),
          'disabled': saving.value,
          'onClick': () => removeGrant(row.index),
        })),
      ]),
  },
])

fetchRole()
fetchCollections()
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">
        {{ t('nuxtUiMongocamp.roleGrants.heading', { roleName }) }}
      </h2>
      <div class="flex gap-2">
        <UTooltip :text="t('nuxtUiMongocamp.common.refresh')">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loading"
            :aria-label="t('nuxtUiMongocamp.common.refresh')"
            @click="fetchRole"
          />
        </UTooltip>
        <UTooltip :text="t('nuxtUiMongocamp.roleGrants.addAllReadTooltip')">
          <UButton
            icon="i-lucide-eye"
            color="neutral"
            variant="outline"
            :label="t('nuxtUiMongocamp.roleGrants.addAllRead')"
            :disabled="saving || loading || !missingReadCollections.length"
            @click="addAllReadGrants"
          />
        </UTooltip>
        <UButton
          icon="i-lucide-plus"
          :label="t('nuxtUiMongocamp.roleGrants.addGrant')"
          @click="openAdd"
        />
      </div>
    </div>

    <MongocampErrorAlert
      :error="loadError"
      @retry="fetchRole"
    />

    <!-- a refused remove has no dialog to show its reason in; add/edit show it inside their own dialog -->
    <UAlert
      v-if="saveError && !isAddModalOpen && !isEditModalOpen"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="t('nuxtUiMongocamp.roleGrants.errorSave')"
      :description="saveError"
    />

    <UTable
      :data="grants"
      :columns="columns"
      :loading="loading"
    >
      <template #empty>
        <MongocampEmptyState :title="t('nuxtUiMongocamp.empty.grants')" />
      </template>
    </UTable>

    <!-- Add Grant Modal -->
    <UModal
      v-model:open="isAddModalOpen"
      :title="t('nuxtUiMongocamp.roleGrants.addGrant')"
    >
      <template #body>
        <FUDataEdit
          :data="newGrant"
          :schema="addGrantSchema"
          :submit-label="t('nuxtUiMongocamp.roleGrants.addGrant')"
          submit-icon="i-lucide-plus"
          @data-saved="handleAddGrant"
        />
        <UAlert
          v-if="saveError"
          class="mt-3"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="saveError"
        />
      </template>
    </UModal>

    <!-- Edit Grant Modal -->
    <UModal
      v-model:open="isEditModalOpen"
      :title="t('nuxtUiMongocamp.roleGrants.editGrantTitle', { name: editGrantName })"
    >
      <template #body>
        <FUDataEdit
          :data="editGrant"
          :schema="editGrantSchema"
          :submit-label="t('nuxtUiMongocamp.common.saveChanges')"
          submit-icon="i-lucide-save"
          @data-saved="handleEditGrant"
        />
        <UAlert
          v-if="saveError"
          class="mt-3"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="saveError"
        />
      </template>
    </UModal>
  </div>
</template>
