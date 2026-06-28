<script setup lang='ts'>
import { h, reactive, ref, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import type { UserProfile } from '@sfxcode/nuxt-mongocamp-server'
import useMongocampAdmin from '../composables/useMongocampAdmin'

interface RoleItem {
  value: string
  label: string
}

const { listUsers, addUser, deleteUser, updateUserRoles, updateUserPassword, listRoles } = useMongocampAdmin()

const users = ref<UserProfile[]>([])
const loading = ref(false)
const filterText = ref('')
const sorting = ref<{ id: string, desc: boolean }[]>([])
let filterTimer: ReturnType<typeof setTimeout> | undefined
const isAddModalOpen = ref(false)
const isEditModalOpen = ref(false)
const isDeleteModalOpen = ref(false)
const userToDelete = ref('')
const errorMessage = ref('')

const newUser = ref<{ userId: string, password: string, roles: RoleItem[] }>({
  userId: '',
  password: '',
  roles: [],
})

const editUser = ref<{ userId: string, password: string, roles: RoleItem[] }>({
  userId: '',
  password: '',
  roles: [],
})

const addUserSchema = reactive([
  {
    $formkit: 'nuxtUIInput',
    name: 'userId',
    label: 'Email',
    validation: 'required|email',
  },
  {
    $formkit: 'nuxtUIInput',
    name: 'password',
    label: 'Password',
    inputType: 'password',
    validation: 'required|length:3',
  },
  {
    $formkit: 'nuxtUIListbox',
    name: 'roles',
    label: 'Roles',
    displayMode: 'transfer',
    options: [] as RoleItem[],
    filter: true,
    class: 'h-60',
    transferHeaderClass: 'text-sm text-gray-500 font-medium',
    transferAll: true,
    transferLeftHeaderText: 'Available',
    transferRightHeaderText: 'Assigned',
  },
])

const editUserSchema = reactive([
  {
    $formkit: 'nuxtUIInput',
    name: 'password',
    label: 'New Password',
    inputType: 'password',
    validation: 'length:3,100',
    help: 'Leave empty to keep current password',
  },
  {
    $formkit: 'nuxtUIListbox',
    name: 'roles',
    label: 'Roles',
    displayMode: 'transfer',
    filter: true,
    class: 'h-60',
    transferHeaderClass: 'text-sm text-gray-500 font-medium',
    options: [] as RoleItem[],
    transferAll: true,
    transferLeftHeaderText: 'Available',
    transferRightHeaderText: 'Assigned',
  },
])

async function fetchUsers() {
  loading.value = true
  try {
    users.value = await listUsers(filterText.value)
  }
  finally {
    loading.value = false
  }
}

function onFilterInput() {
  clearTimeout(filterTimer)
  filterTimer = setTimeout(() => fetchUsers(), 300)
}

async function fetchRoles() {
  const roles = await listRoles()
  const items = roles.map(r => ({ value: r.name, label: r.name }))
  addUserSchema[2]!.options = items
  editUserSchema[1]!.options = items
}

async function handleAddUser() {
  errorMessage.value = ''
  try {
    const roles = newUser.value.roles.map(r => r.value)
    await addUser(newUser.value.userId, newUser.value.password, '', roles)
    isAddModalOpen.value = false
    newUser.value = { userId: '', password: '', roles: [] }
    await fetchUsers()
  }
  catch (e: unknown) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to add user'
  }
}

function openEdit(user: UserProfile) {
  editUser.value = {
    userId: user.user,
    password: '',
    roles: (user.roles ?? []).map(r => ({ value: r, label: r })),
  }
  isEditModalOpen.value = true
}

async function handleEditUser() {
  errorMessage.value = ''
  try {
    const roles = editUser.value.roles.map(r => r.value)
    await updateUserRoles(editUser.value.userId, roles)
    if (editUser.value.password) {
      await updateUserPassword(editUser.value.userId, editUser.value.password)
    }
    isEditModalOpen.value = false
    await fetchUsers()
  }
  catch (e: unknown) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to update user'
  }
}

function confirmDelete(userId: string) {
  userToDelete.value = userId
  isDeleteModalOpen.value = true
}

async function handleDeleteUser() {
  await deleteUser(userToDelete.value)
  isDeleteModalOpen.value = false
  await fetchUsers()
}

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

function sortHeader(column: Column<UserProfile>, label: string) {
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

const columns: TableColumn<UserProfile>[] = [
  {
    accessorKey: 'user',
    header: ({ column }) => sortHeader(column, 'User'),
  },
  {
    accessorKey: 'isAdmin',
    header: ({ column }) => sortHeader(column, 'Admin'),
    cell: ({ row }) =>
      h(UBadge, {
        label: row.original.isAdmin ? 'Admin' : 'User',
        color: row.original.isAdmin ? 'error' : 'neutral',
        variant: 'subtle',
      }),
  },
  {
    accessorKey: 'roles',
    header: 'Roles',
    cell: ({ row }) => {
      const roles = row.original.roles ?? []
      if (!roles.length)
        return h('span', { class: 'text-dimmed' }, '—')
      return h(
        'div',
        { class: 'flex flex-wrap gap-1' },
        roles.map(role => h(UBadge, { label: role, color: 'primary', variant: 'subtle' })),
      )
    },
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
          'aria-label': 'Edit user',
          'onClick': () => openEdit(row.original),
        }),
        h(UButton, {
          'icon': 'i-lucide-trash-2',
          'color': 'error',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': 'Delete user',
          'onClick': () => confirmDelete(row.original.user),
        }),
      ]),
  },
]

fetchUsers()
fetchRoles()
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <h2 class="text-xl font-semibold">
        Users
      </h2>
      <div class="flex flex-1 items-center gap-2">
        <UInput
          v-model="filterText"
          icon="i-lucide-search"
          placeholder="Search users..."
          size="sm"
          class="flex-1 max-w-xs"
          @input="onFilterInput"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          :loading="loading"
          aria-label="Refresh"
          @click="fetchUsers"
        />
        <UButton
          icon="i-lucide-plus"
          label="Add User"
          @click="isAddModalOpen = true"
        />
      </div>
    </div>

    <UTable
      v-model:sorting="sorting"
      :data="users"
      :columns="columns"
      :loading="loading"
    />

    <!-- Add User Modal -->
    <UModal
      v-model:open="isAddModalOpen"
      title="Add User"
    >
      <template #body>
        <FUDataEdit
          :data="newUser"
          :schema="addUserSchema"
          submit-label="Add User"
          submit-icon="i-lucide-plus"
          @data-saved="handleAddUser"
        />
        <p
          v-if="errorMessage"
          class="mt-2 text-sm text-error-500"
        >
          {{ errorMessage }}
        </p>
      </template>
    </UModal>

    <!-- Edit User Modal -->
    <UModal
      v-model:open="isEditModalOpen"
      :title="`Edit User: ${editUser.userId}`"
    >
      <template #body>
        <FUDataEdit
          :data="editUser"
          :schema="editUserSchema"
          submit-label="Save Changes"
          submit-icon="i-lucide-save"
          @data-saved="handleEditUser"
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
      title="Delete User"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p>
          Are you sure you want to delete user <strong>{{ userToDelete }}</strong>?
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
          @click="handleDeleteUser"
        />
      </template>
    </UModal>
  </div>
</template>
