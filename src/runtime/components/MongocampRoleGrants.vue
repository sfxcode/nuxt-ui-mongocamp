<script setup lang='ts'>
import { h, reactive, ref, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Grant } from '@sfxcode/nuxt-mongocamp-server'
import useMongocampAdmin from '../composables/useMongocampAdmin'

const props = defineProps<{
  roleName: string
}>()

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
    label: 'Collection',
    class: 'w-full',
    options: [] as string[],
    validation: 'required',
  },
  {
    $formkit: 'nuxtUISwitch',
    name: 'read',
    label: 'Read',
  },
  {
    $formkit: 'nuxtUISwitch',
    name: 'write',
    label: 'Write',
  },
  {
    $formkit: 'nuxtUISwitch',
    name: 'administrate',
    label: 'Administrate',
  },
])

const editGrantSchema = reactive([
  {
    $formkit: 'nuxtUISwitch',
    name: 'read',
    label: 'Read',
  },
  {
    $formkit: 'nuxtUISwitch',
    name: 'write',
    label: 'Write',
  },
  {
    $formkit: 'nuxtUISwitch',
    name: 'administrate',
    label: 'Administrate',
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
    errorMessage.value = e instanceof Error ? e.message : 'Failed to save grants'
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

const columns: TableColumn<Grant>[] = [
  {
    accessorKey: 'name',
    header: 'Collection',
  },
  {
    accessorKey: 'read',
    header: 'Read',
    cell: ({ row }) =>
      h(UBadge, {
        label: row.original.read ? 'Yes' : 'No',
        color: row.original.read ? 'success' : 'neutral',
        variant: 'subtle',
      }),
  },
  {
    accessorKey: 'write',
    header: 'Write',
    cell: ({ row }) =>
      h(UBadge, {
        label: row.original.write ? 'Yes' : 'No',
        color: row.original.write ? 'success' : 'neutral',
        variant: 'subtle',
      }),
  },
  {
    accessorKey: 'administrate',
    header: 'Admin',
    cell: ({ row }) =>
      h(UBadge, {
        label: row.original.administrate ? 'Yes' : 'No',
        color: row.original.administrate ? 'error' : 'neutral',
        variant: 'subtle',
      }),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) =>
      h('div', { class: 'flex gap-1 justify-end' }, [
        h(UButton, {
          'icon': 'i-lucide-pencil',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': 'Edit grant',
          'onClick': () => openEdit(row.index),
        }),
        h(UButton, {
          'icon': 'i-lucide-trash-2',
          'color': 'error',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': 'Remove grant',
          'onClick': () => removeGrant(row.index),
        }),
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
        Grants: {{ roleName }}
      </h2>
      <div class="flex gap-2">
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          :loading="loading"
          aria-label="Refresh"
          @click="fetchRole"
        />
        <UButton
          icon="i-lucide-plus"
          label="Add Grant"
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
      title="Add Grant"
    >
      <template #body>
        <FUDataEdit
          :data="newGrant"
          :schema="addGrantSchema"
          submit-label="Add Grant"
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
      :title="`Edit Grant: ${editGrantName}`"
    >
      <template #body>
        <FUDataEdit
          :data="editGrant"
          :schema="editGrantSchema"
          submit-label="Save Changes"
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
