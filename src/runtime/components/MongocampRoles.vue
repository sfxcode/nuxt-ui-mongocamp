<script setup lang='ts'>
import { h, reactive, ref, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import type { Grant, Role } from '@sfxcode/nuxt-mongocamp-server'
import useMongocampAdmin from '../composables/useMongocampAdmin'

const props = defineProps<{
  grantsPath?: string
}>()

const { listRoles, addRole, updateRole, deleteRole } = useMongocampAdmin()

const roles = ref<Role[]>([])
const loading = ref(false)
const filterText = ref('')
const sorting = ref<{ id: string, desc: boolean }[]>([])
let filterTimer: ReturnType<typeof setTimeout> | undefined
const isAddModalOpen = ref(false)
const isEditModalOpen = ref(false)
const isDeleteModalOpen = ref(false)
const roleToDelete = ref('')
const errorMessage = ref('')

const newRole = ref({ name: '', isAdmin: false })
const editRole = ref({ roleName: '', isAdmin: false })
const editGrants = ref<Grant[]>([])

const addRoleSchema = reactive([
  {
    $formkit: 'nuxtUIInput',
    name: 'name',
    label: 'Role Name',
    validation: 'required|length:2',
  },
  {
    $formkit: 'nuxtUISwitch',
    name: 'isAdmin',
    label: 'Admin Role',
  },
])

const editRoleSchema = reactive([
  {
    $formkit: 'nuxtUISwitch',
    name: 'isAdmin',
    label: 'Admin Role',
  },
])

async function fetchRoles() {
  loading.value = true
  try {
    roles.value = await listRoles(filterText.value)
  }
  finally {
    loading.value = false
  }
}

function onFilterInput() {
  clearTimeout(filterTimer)
  filterTimer = setTimeout(() => fetchRoles(), 300)
}

async function handleAddRole() {
  errorMessage.value = ''
  try {
    await addRole(newRole.value.name, newRole.value.isAdmin)
    isAddModalOpen.value = false
    newRole.value = { name: '', isAdmin: false }
    await fetchRoles()
  }
  catch (e: unknown) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to add role'
  }
}

function openEdit(role: Role) {
  editRole.value = { roleName: role.name, isAdmin: role.isAdmin }
  editGrants.value = (role.collectionGrants ?? []).map(g => ({ ...g }))
  isEditModalOpen.value = true
}

async function handleEditRole() {
  errorMessage.value = ''
  try {
    await updateRole(editRole.value.roleName, editRole.value.isAdmin, editGrants.value)
    isEditModalOpen.value = false
    await fetchRoles()
  }
  catch (e: unknown) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to update role'
  }
}

function confirmDelete(roleName: string) {
  roleToDelete.value = roleName
  isDeleteModalOpen.value = true
}

async function handleDeleteRole() {
  await deleteRole(roleToDelete.value)
  isDeleteModalOpen.value = false
  await fetchRoles()
}

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UTooltip = resolveComponent('UTooltip')

function withTooltip(text: string, node: ReturnType<typeof h>) {
  return h(UTooltip, { text }, { default: () => node })
}

function sortHeader(column: Column<Role>, label: string) {
  const isSorted = column.getIsSorted()
  return h(UButton, {
    color: 'neutral',
    variant: 'ghost',
    label,
    icon: isSorted === 'asc'
      ? 'i-lucide-arrow-up-narrow-wide'
      : isSorted === 'desc'
        ? 'i-lucide-arrow-down-wide-narrow'
        : 'i-lucide-arrow-up-down',
    class: '-mx-2.5',
    onClick: () => column.toggleSorting(isSorted === 'asc'),
  })
}

const columns: TableColumn<Role>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => sortHeader(column, 'Role'),
  },
  {
    accessorKey: 'isAdmin',
    header: 'Admin',
    cell: ({ row }) =>
      h(UBadge, {
        label: row.original.isAdmin ? 'Admin' : 'Standard',
        color: row.original.isAdmin ? 'error' : 'neutral',
        variant: 'subtle',
      }),
  },
  {
    accessorKey: 'collectionGrants',
    header: 'Grants',
    cell: ({ row }) => {
      const count = row.original.collectionGrants?.length ?? 0
      return count
        ? h(UBadge, { label: String(count), color: 'primary', variant: 'subtle' })
        : h('span', { class: 'text-dimmed' }, '—')
    },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) =>
      h('div', { class: 'flex gap-1 justify-end' }, [
        withTooltip('Manage grants', h(UButton, {
          'icon': 'i-lucide-key',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': 'Manage grants',
          'to': props.grantsPath ? `${props.grantsPath}/${row.original.name}` : `/secured/admin/roles/${row.original.name}`,
        })),
        withTooltip('Edit role', h(UButton, {
          'icon': 'i-lucide-pencil',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': 'Edit role',
          'onClick': () => openEdit(row.original),
        })),
        withTooltip('Delete role', h(UButton, {
          'icon': 'i-lucide-trash-2',
          'color': 'error',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': 'Delete role',
          'onClick': () => confirmDelete(row.original.name),
        })),
      ]),
  },
]

fetchRoles()
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <h2 class="text-xl font-semibold">
        Roles
      </h2>
      <div class="flex flex-1 items-center gap-2">
        <UInput
          v-model="filterText"
          icon="i-lucide-search"
          placeholder="Search roles..."
          size="sm"
          class="flex-1 max-w-xs"
          @input="onFilterInput"
        />
        <UTooltip text="Refresh">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loading"
            aria-label="Refresh"
            @click="fetchRoles"
          />
        </UTooltip>
        <UButton
          icon="i-lucide-plus"
          label="Add Role"
          @click="isAddModalOpen = true"
        />
      </div>
    </div>

    <UTable
      v-model:sorting="sorting"
      :data="roles"
      :columns="columns"
      :loading="loading"
    />

    <!-- Add Role Modal -->
    <UModal
      v-model:open="isAddModalOpen"
      title="Add Role"
    >
      <template #body>
        <FUDataEdit
          :data="newRole"
          :schema="addRoleSchema"
          submit-label="Add Role"
          submit-icon="i-lucide-plus"
          @data-saved="handleAddRole"
        />
        <p
          v-if="errorMessage"
          class="mt-2 text-sm text-error-500"
        >
          {{ errorMessage }}
        </p>
      </template>
    </UModal>

    <!-- Edit Role Modal -->
    <UModal
      v-model:open="isEditModalOpen"
      :title="`Edit Role: ${editRole.roleName}`"
    >
      <template #body>
        <FUDataEdit
          :data="editRole"
          :schema="editRoleSchema"
          submit-label="Save Changes"
          submit-icon="i-lucide-save"
          @data-saved="handleEditRole"
        />
        <p
          v-if="errorMessage"
          class="mt-2 text-sm text-error-500"
        >
          {{ errorMessage }}
        </p>
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal
      v-model:open="isDeleteModalOpen"
      title="Delete Role"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p>
          Are you sure you want to delete role <strong>{{ roleToDelete }}</strong>?
          This action cannot be undone.
        </p>
      </template>
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="isDeleteModalOpen = false"
        />
        <UButton
          label="Delete"
          color="error"
          @click="handleDeleteRole"
        />
      </template>
    </UModal>
  </div>
</template>
