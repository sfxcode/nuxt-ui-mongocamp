<script setup lang='ts'>
import { computed, h, reactive, ref, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import type { UserProfile } from '@sfxcode/nuxt-mongocamp-server'
import { useI18n, useMongocampError, useMongocampStorage } from '#imports'
import useMongocampAdmin from '../composables/useMongocampAdmin'
import { runBulkDelete } from '../composables/useMongocampBulkDelete'
import { createSelectColumn } from '../utils/createSelectColumn'

interface RoleItem {
  value: string
  label: string
}

const { t } = useI18n()
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
    label: t('nuxtUiMongocamp.users.email'),
    validation: 'required|email',
  },
  {
    $formkit: 'nuxtUIInput',
    name: 'password',
    label: t('nuxtUiMongocamp.users.password'),
    inputType: 'password',
    validation: 'required|length:3',
  },
  {
    $formkit: 'nuxtUIListbox',
    name: 'roles',
    label: t('nuxtUiMongocamp.users.roles'),
    displayMode: 'transfer',
    options: [] as RoleItem[],
    filter: true,
    class: 'h-60',
    transferHeaderClass: 'text-sm text-gray-500 font-medium',
    transferAll: true,
    transferLeftHeaderText: t('nuxtUiMongocamp.users.available'),
    transferRightHeaderText: t('nuxtUiMongocamp.users.assigned'),
  },
])

const editUserSchema = reactive([
  {
    $formkit: 'nuxtUIInput',
    name: 'password',
    label: t('nuxtUiMongocamp.users.newPassword'),
    inputType: 'password',
    validation: 'length:3,100',
    help: t('nuxtUiMongocamp.users.newPasswordHelp'),
  },
  {
    $formkit: 'nuxtUIListbox',
    name: 'roles',
    label: t('nuxtUiMongocamp.users.roles'),
    displayMode: 'transfer',
    filter: true,
    class: 'h-60',
    transferHeaderClass: 'text-sm text-gray-500 font-medium',
    options: [] as RoleItem[],
    transferAll: true,
    transferLeftHeaderText: t('nuxtUiMongocamp.users.available'),
    transferRightHeaderText: t('nuxtUiMongocamp.users.assigned'),
  },
])

const loadError = ref<unknown>(null)

const { describeError } = useMongocampError()
const storage = useMongocampStorage()
const rowSelection = ref<Record<string, boolean>>({})
const selectedUserIds = computed(() => Object.keys(rowSelection.value).filter(id => rowSelection.value[id]))
const bulkDeleting = ref(false)
const bulkError = ref('')

// the signed-in user can't be selected: deleting yourself would end your own session
function canSelectUser(row: { original: UserProfile }): boolean {
  return row.original.user !== storage.value?.profile.user
}

async function handleBulkDelete() {
  bulkDeleting.value = true
  bulkError.value = ''
  const ids = [...selectedUserIds.value]
  try {
    const { failed } = await runBulkDelete(ids, id => deleteUser(id))
    await fetchUsers()
    if (failed.length > 0) {
      // keep only what is still there selected, and say why
      rowSelection.value = Object.fromEntries(failed.map(f => [f.item, true]))
      bulkError.value = t('nuxtUiMongocamp.bulk.partialFailure', { failed: failed.length, total: ids.length, reason: describeError(failed[0]!.error).message })
    }
  }
  finally {
    bulkDeleting.value = false
  }
}

async function fetchUsers() {
  loading.value = true
  loadError.value = null
  // a reload can change which rows exist, so a stale selection must never survive it
  rowSelection.value = {}
  try {
    users.value = await listUsers(filterText.value)
  }
  catch (e: unknown) {
    loadError.value = e
    users.value = []
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
    errorMessage.value = e instanceof Error ? e.message : t('nuxtUiMongocamp.users.errorAddUser')
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
    errorMessage.value = e instanceof Error ? e.message : t('nuxtUiMongocamp.users.errorEditUser')
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
const UTooltip = resolveComponent('UTooltip')
const UCheckbox = resolveComponent('UCheckbox')

function withTooltip(text: string, node: ReturnType<typeof h>) {
  return h(UTooltip, { text }, { default: () => node })
}

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

const columns = computed<TableColumn<UserProfile>[]>(() => [
  createSelectColumn<UserProfile>(UCheckbox, {
    selectAll: t('nuxtUiMongocamp.bulk.selectAll'),
    selectRow: t('nuxtUiMongocamp.bulk.selectRow'),
    unselectable: t('nuxtUiMongocamp.bulk.cannotSelectSelf'),
  }),
  {
    accessorKey: 'user',
    header: ({ column }) => sortHeader(column, t('nuxtUiMongocamp.users.columnUser')),
  },
  {
    accessorKey: 'isAdmin',
    header: ({ column }) => sortHeader(column, t('nuxtUiMongocamp.users.columnAdmin')),
    cell: ({ row }) =>
      h(UBadge, {
        label: row.original.isAdmin ? t('nuxtUiMongocamp.users.roleAdmin') : t('nuxtUiMongocamp.users.roleUser'),
        color: row.original.isAdmin ? 'error' : 'neutral',
        variant: 'subtle',
      }),
  },
  {
    accessorKey: 'roles',
    header: t('nuxtUiMongocamp.users.columnRoles'),
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
        withTooltip(t('nuxtUiMongocamp.users.editUserTooltip'), h(UButton, {
          'icon': 'i-lucide-pencil',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': t('nuxtUiMongocamp.users.editUserTooltip'),
          'onClick': () => openEdit(row.original),
        })),
        withTooltip(t('nuxtUiMongocamp.users.deleteUserTooltip'), h(UButton, {
          'icon': 'i-lucide-trash-2',
          'color': 'error',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': t('nuxtUiMongocamp.users.deleteUserTooltip'),
          'onClick': () => confirmDelete(row.original.user),
        })),
      ]),
  },
])

fetchUsers()
fetchRoles()
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <h2 class="text-xl font-semibold">
        {{ t('nuxtUiMongocamp.users.heading') }}
      </h2>
      <div class="flex flex-1 items-center gap-2">
        <UInput
          v-model="filterText"
          icon="i-lucide-search"
          :placeholder="t('nuxtUiMongocamp.users.searchPlaceholder')"
          size="sm"
          class="flex-1 max-w-xs"
          @input="onFilterInput"
        />
        <UTooltip :text="t('nuxtUiMongocamp.common.refresh')">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loading"
            :aria-label="t('nuxtUiMongocamp.common.refresh')"
            @click="fetchUsers"
          />
        </UTooltip>
        <UButton
          icon="i-lucide-plus"
          :label="t('nuxtUiMongocamp.users.addUser')"
          @click="isAddModalOpen = true"
        />
      </div>
    </div>

    <MongocampErrorAlert
      :error="loadError"
      @retry="fetchUsers"
    />

    <MongocampBulkDelete
      :selected="selectedUserIds"
      :deleting="bulkDeleting"
      :error="bulkError"
      @open="bulkError = ''"
      @clear="rowSelection = {}"
      @confirm="handleBulkDelete"
    />

    <UTable
      v-model:sorting="sorting"
      v-model:row-selection="rowSelection"
      :get-row-id="(row: UserProfile) => row.user"
      :row-selection-options="{ enableRowSelection: canSelectUser }"
      :data="users"
      :columns="columns"
      :loading="loading"
    >
      <template #empty>
        <MongocampEmptyState :title="t('nuxtUiMongocamp.empty.users')" />
      </template>
    </UTable>

    <!-- Add User Modal -->
    <UModal
      v-model:open="isAddModalOpen"
      :title="t('nuxtUiMongocamp.users.addUser')"
    >
      <template #body>
        <FUDataEdit
          :data="newUser"
          :schema="addUserSchema"
          :submit-label="t('nuxtUiMongocamp.users.addUser')"
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
      :title="t('nuxtUiMongocamp.users.editUserTitle', { userId: editUser.userId })"
    >
      <template #body>
        <FUDataEdit
          :data="editUser"
          :schema="editUserSchema"
          :submit-label="t('nuxtUiMongocamp.common.saveChanges')"
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
      :title="t('nuxtUiMongocamp.users.deleteUserTitle')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p>{{ t('nuxtUiMongocamp.users.confirmDelete', { userId: userToDelete }) }}</p>
      </template>
      <template #footer>
        <UButton
          :label="t('nuxtUiMongocamp.common.cancel')"
          color="neutral"
          variant="ghost"
          @click="isDeleteModalOpen = false"
        />
        <UButton
          :label="t('nuxtUiMongocamp.common.delete')"
          color="error"
          @click="handleDeleteUser"
        />
      </template>
    </UModal>
  </div>
</template>
