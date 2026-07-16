<script setup lang='ts'>
import { h, reactive, ref, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import type { Grant, Role } from '@sfxcode/nuxt-mongocamp-server'
import { useI18n } from '#imports'
import useMongocampAdmin from '../composables/useMongocampAdmin'

const props = defineProps<{
  grantsPath?: string
}>()

const { t } = useI18n()
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
    label: t('nuxtUiMongocamp.roles.roleName'),
    validation: 'required|length:2',
  },
  {
    $formkit: 'nuxtUISwitch',
    name: 'isAdmin',
    label: t('nuxtUiMongocamp.roles.adminRole'),
  },
])

const editRoleSchema = reactive([
  {
    $formkit: 'nuxtUISwitch',
    name: 'isAdmin',
    label: t('nuxtUiMongocamp.roles.adminRole'),
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
    errorMessage.value = e instanceof Error ? e.message : t('nuxtUiMongocamp.roles.errorAddRole')
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
    errorMessage.value = e instanceof Error ? e.message : t('nuxtUiMongocamp.roles.errorEditRole')
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
    header: ({ column }) => sortHeader(column, t('nuxtUiMongocamp.roles.columnRole')),
  },
  {
    accessorKey: 'isAdmin',
    header: t('nuxtUiMongocamp.roles.columnAdmin'),
    cell: ({ row }) =>
      h(UBadge, {
        label: row.original.isAdmin ? t('nuxtUiMongocamp.common.admin') : t('nuxtUiMongocamp.common.standard'),
        color: row.original.isAdmin ? 'error' : 'neutral',
        variant: 'subtle',
      }),
  },
  {
    accessorKey: 'collectionGrants',
    header: t('nuxtUiMongocamp.roles.columnGrants'),
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
        withTooltip(t('nuxtUiMongocamp.roles.manageGrantsTooltip'), h(UButton, {
          'icon': 'i-lucide-key',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': t('nuxtUiMongocamp.roles.manageGrantsTooltip'),
          'to': props.grantsPath ? `${props.grantsPath}/${row.original.name}` : `/secured/admin/roles/${row.original.name}`,
        })),
        withTooltip(t('nuxtUiMongocamp.roles.editRoleTooltip'), h(UButton, {
          'icon': 'i-lucide-pencil',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': t('nuxtUiMongocamp.roles.editRoleTooltip'),
          'onClick': () => openEdit(row.original),
        })),
        withTooltip(t('nuxtUiMongocamp.roles.deleteRoleTooltip'), h(UButton, {
          'icon': 'i-lucide-trash-2',
          'color': 'error',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': t('nuxtUiMongocamp.roles.deleteRoleTooltip'),
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
        {{ t('nuxtUiMongocamp.roles.heading') }}
      </h2>
      <div class="flex flex-1 items-center gap-2">
        <UInput
          v-model="filterText"
          icon="i-lucide-search"
          :placeholder="t('nuxtUiMongocamp.roles.searchPlaceholder')"
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
            @click="fetchRoles"
          />
        </UTooltip>
        <UButton
          icon="i-lucide-plus"
          :label="t('nuxtUiMongocamp.roles.addRole')"
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
      :title="t('nuxtUiMongocamp.roles.addRole')"
    >
      <template #body>
        <FUDataEdit
          :data="newRole"
          :schema="addRoleSchema"
          :submit-label="t('nuxtUiMongocamp.roles.addRole')"
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
      :title="t('nuxtUiMongocamp.roles.editRoleTitle', { roleName: editRole.roleName })"
    >
      <template #body>
        <FUDataEdit
          :data="editRole"
          :schema="editRoleSchema"
          :submit-label="t('nuxtUiMongocamp.common.saveChanges')"
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
      :title="t('nuxtUiMongocamp.roles.deleteRoleTitle')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p>{{ t('nuxtUiMongocamp.roles.confirmDelete', { roleName: roleToDelete }) }}</p>
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
          @click="handleDeleteRole"
        />
      </template>
    </UModal>
  </div>
</template>
