<script setup lang='ts'>
import { h, reactive, ref, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Grant } from '@sfxcode/nuxt-mongocamp-server'
import { useI18n } from '#imports'
import useMongocampAdmin from '../composables/useMongocampAdmin'

const props = defineProps<{
  roleName: string
}>()

const { t } = useI18n()
const { listRoles, updateRole, listCollections } = useMongocampAdmin()

const grants = ref<Grant[]>([])
const allCollections = ref<string[]>([])
const isAdmin = ref(false)
const loading = ref(false)
const isAddModalOpen = ref(false)
const isEditModalOpen = ref(false)
const errorMessage = ref('')
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

async function fetchRole() {
  loading.value = true
  try {
    const roles = await listRoles()
    const role = roles.find(r => r.name === props.roleName)
    if (role) {
      isAdmin.value = role.isAdmin
      grants.value = (role.collectionGrants ?? []).map(g => ({ ...g }))
    }
  }
  finally {
    loading.value = false
  }
}

async function fetchCollections() {
  allCollections.value = await listCollections()
}

async function saveGrants() {
  errorMessage.value = ''
  try {
    await updateRole(props.roleName, isAdmin.value, grants.value)
    await fetchRole()
  }
  catch (e: unknown) {
    errorMessage.value = e instanceof Error ? e.message : t('nuxtUiMongocamp.roleGrants.errorSave')
  }
}

async function handleAddGrant() {
  const raw = newGrant.value.collectionName as unknown as { value?: string, label?: string }
  const collectionName = typeof newGrant.value.collectionName === 'object'
    ? raw.value ?? raw.label ?? ''
    : newGrant.value.collectionName
  grants.value.push({
    name: collectionName,
    read: newGrant.value.read,
    write: newGrant.value.write,
    administrate: newGrant.value.administrate,
    grantType: 'COLLECTION',
  })
  await saveGrants()
  isAddModalOpen.value = false
}

function openEdit(index: number) {
  const grant = grants.value[index]!
  editIndex.value = index
  editGrantName.value = grant.name
  editGrant.value = { read: grant.read, write: grant.write, administrate: grant.administrate }
  isEditModalOpen.value = true
}

async function handleEditGrant() {
  const grant = grants.value[editIndex.value]!
  grants.value[editIndex.value] = {
    ...grant,
    read: editGrant.value.read,
    write: editGrant.value.write,
    administrate: editGrant.value.administrate,
  }
  await saveGrants()
  isEditModalOpen.value = false
}

async function removeGrant(index: number) {
  grants.value.splice(index, 1)
  await saveGrants()
}

function openAdd() {
  const grantedNames = new Set(grants.value.map(g => g.name))
  addGrantSchema[0]!.options = allCollections.value.filter(c => !grantedNames.has(c))
  newGrant.value = { collectionName: '', read: false, write: false, administrate: false }
  isAddModalOpen.value = true
}

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UTooltip = resolveComponent('UTooltip')

function withTooltip(text: string, node: ReturnType<typeof h>) {
  return h(UTooltip, { text }, { default: () => node })
}

const columns: TableColumn<Grant>[] = [
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
          'onClick': () => openEdit(row.index),
        })),
        withTooltip(t('nuxtUiMongocamp.roleGrants.removeGrantTooltip'), h(UButton, {
          'icon': 'i-lucide-trash-2',
          'color': 'error',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': t('nuxtUiMongocamp.roleGrants.removeGrantTooltip'),
          'onClick': () => removeGrant(row.index),
        })),
      ]),
  },
]

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
        <UButton
          icon="i-lucide-plus"
          :label="t('nuxtUiMongocamp.roleGrants.addGrant')"
          @click="openAdd"
        />
      </div>
    </div>

    <UTable
      :data="grants"
      :columns="columns"
      :loading="loading"
    />

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
        <p
          v-if="errorMessage"
          class="mt-2 text-sm text-error-500"
        >
          {{ errorMessage }}
        </p>
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
        <p
          v-if="errorMessage"
          class="mt-2 text-sm text-error-500"
        >
          {{ errorMessage }}
        </p>
      </template>
    </UModal>
  </div>
</template>
