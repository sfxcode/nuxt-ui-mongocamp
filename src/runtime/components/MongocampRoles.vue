<script setup lang='ts'>
import { computed, h, reactive, ref, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import type { Grant, Role } from '@sfxcode/nuxt-mongocamp-server'
import { useI18n, useMongocampError } from '#imports'
import useMongocampAdmin from '../composables/useMongocampAdmin'
import { runBulkDelete } from '../utils/bulkDelete'
import { createSelectColumn } from '../utils/createSelectColumn'

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
const isCloneModalOpen = ref(false)
const roleToDelete = ref('')
const errorMessage = ref('')

const newRole = ref({ name: '', isAdmin: false })
const editRole = ref({ roleName: '', isAdmin: false })
const editGrants = ref<Grant[]>([])
const cloneSource = ref('')
const cloneRole = ref({ name: '', isAdmin: false })
const cloneGrants = ref<Grant[]>([])
const cloneError = ref('')
const cloning = ref(false)

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

const cloneRoleSchema = reactive([
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

const loadError = ref<unknown>(null)

const { describeError } = useMongocampError()
const rowSelection = ref<Record<string, boolean>>({})
const selectedRoleNames = computed(() => Object.keys(rowSelection.value).filter(name => rowSelection.value[name]))
const bulkDeleting = ref(false)
const bulkError = ref('')

async function handleBulkDelete() {
  bulkDeleting.value = true
  bulkError.value = ''
  const names = [...selectedRoleNames.value]
  try {
    const { failed } = await runBulkDelete(names, name => deleteRole(name))
    await fetchRoles()
    if (failed.length > 0) {
      // keep only what is still there selected, and say why
      rowSelection.value = Object.fromEntries(failed.map(f => [f.item, true]))
      bulkError.value = t('nuxtUiMongocamp.bulk.partialFailure', { failed: failed.length, total: names.length, reason: describeError(failed[0]!.error).message })
    }
  }
  finally {
    bulkDeleting.value = false
  }
}

async function fetchRoles() {
  loading.value = true
  loadError.value = null
  // a reload can change which rows exist, so a stale selection must never survive it
  rowSelection.value = {}
  try {
    roles.value = await listRoles(filterText.value)
  }
  catch (e: unknown) {
    loadError.value = e
    roles.value = []
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

function openClone(role: Role) {
  cloneSource.value = role.name
  cloneRole.value = { name: '', isAdmin: role.isAdmin }
  cloneGrants.value = (role.collectionGrants ?? []).map(g => ({ ...g }))
  cloneError.value = ''
  isCloneModalOpen.value = true
}

// A refused clone keeps the dialog open with the reason (e.g. the name is taken) so the input isn't lost.
async function handleCloneRole() {
  cloning.value = true
  cloneError.value = ''
  try {
    await addRole(cloneRole.value.name, cloneRole.value.isAdmin, cloneGrants.value)
    isCloneModalOpen.value = false
    await fetchRoles()
  }
  catch (e: unknown) {
    cloneError.value = describeError(e, 'nuxtUiMongocamp.roles.errorClone').message
  }
  finally {
    cloning.value = false
  }
}

const deleteError = ref('')
const deleting = ref(false)

function confirmDelete(roleName: string) {
  roleToDelete.value = roleName
  deleteError.value = ''
  isDeleteModalOpen.value = true
}

// A refused delete must not close the modal: it stays open with the reason so the user can try again or cancel.
async function handleDeleteRole() {
  deleting.value = true
  deleteError.value = ''
  try {
    await deleteRole(roleToDelete.value)
    isDeleteModalOpen.value = false
    await fetchRoles()
  }
  catch (e: unknown) {
    deleteError.value = describeError(e, 'nuxtUiMongocamp.roles.errorDelete').message
  }
  finally {
    deleting.value = false
  }
}

// Read-only details of a role, rendered from the list row (`getRole` returns exactly the same object).
// It shows a copy, so the row is never touched; editing keeps going through the edit modal and
// MongocampRoleGrants.
const isDetailOpen = ref(false)
const detail = ref<{ name: string, isAdmin: boolean, grants: Grant[] } | null>(null)

function openDetail(role: Role) {
  detail.value = {
    name: role.name,
    isAdmin: role.isAdmin,
    grants: (role.collectionGrants ?? []).map(g => ({ ...g })),
  }
  isDetailOpen.value = true
}

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UTooltip = resolveComponent('UTooltip')
const UCheckbox = resolveComponent('UCheckbox')

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

const columns = computed<TableColumn<Role>[]>(() => [
  createSelectColumn<Role>(UCheckbox, { selectAll: t('nuxtUiMongocamp.bulk.selectAll'), selectRow: t('nuxtUiMongocamp.bulk.selectRow') }),
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
        withTooltip(t('nuxtUiMongocamp.roles.detailsTooltip'), h(UButton, {
          'icon': 'i-lucide-info',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': t('nuxtUiMongocamp.roles.detailsTooltip'),
          'onClick': () => openDetail(row.original),
        })),
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
        withTooltip(t('nuxtUiMongocamp.roles.cloneRoleTooltip'), h(UButton, {
          'icon': 'i-lucide-copy',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': t('nuxtUiMongocamp.roles.cloneRoleTooltip'),
          'onClick': () => openClone(row.original),
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
])

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

    <MongocampErrorAlert
      :error="loadError"
      @retry="fetchRoles"
    />

    <MongocampBulkDelete
      :selected="selectedRoleNames"
      :deleting="bulkDeleting"
      :error="bulkError"
      @open="bulkError = ''"
      @clear="rowSelection = {}"
      @confirm="handleBulkDelete"
    />

    <UTable
      v-model:sorting="sorting"
      v-model:row-selection="rowSelection"
      :get-row-id="(row: Role) => row.name"
      :data="roles"
      :columns="columns"
      :loading="loading"
    >
      <template #empty>
        <MongocampEmptyState :title="t('nuxtUiMongocamp.empty.roles')" />
      </template>
    </UTable>

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

    <!-- Clone Role Modal -->
    <UModal
      v-model:open="isCloneModalOpen"
      :title="t('nuxtUiMongocamp.roles.cloneRoleTitle', { roleName: cloneSource })"
    >
      <template #body>
        <p class="mb-3 text-sm text-dimmed">
          {{ t('nuxtUiMongocamp.roles.cloneRoleHint', { count: cloneGrants.length }) }}
        </p>
        <FUDataEdit
          :data="cloneRole"
          :schema="cloneRoleSchema"
          :submit-label="t('nuxtUiMongocamp.roles.cloneRole')"
          submit-icon="i-lucide-copy"
          @data-saved="handleCloneRole"
        />
        <UAlert
          v-if="cloneError"
          class="mt-3"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="cloneError"
        />
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
        <UAlert
          v-if="deleteError"
          class="mt-3"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="deleteError"
        />
      </template>
      <template #footer>
        <UButton
          :label="t('nuxtUiMongocamp.common.cancel')"
          color="neutral"
          variant="ghost"
          :disabled="deleting"
          @click="isDeleteModalOpen = false"
        />
        <UButton
          :label="t('nuxtUiMongocamp.common.delete')"
          color="error"
          :loading="deleting"
          @click="handleDeleteRole"
        />
      </template>
    </UModal>

    <USlideover
      v-model:open="isDetailOpen"
      :title="t('nuxtUiMongocamp.roles.detailsTitle', { roleName: detail?.name ?? '' })"
    >
      <template #body>
        <div
          v-if="detail"
          class="flex flex-col gap-4"
        >
          <div class="flex items-center gap-2">
            <UBadge
              :label="detail.isAdmin ? t('nuxtUiMongocamp.common.admin') : t('nuxtUiMongocamp.common.standard')"
              :color="detail.isAdmin ? 'error' : 'neutral'"
              variant="subtle"
            />
          </div>
          <section class="flex flex-col gap-2">
            <h3 class="text-sm font-semibold">
              {{ t('nuxtUiMongocamp.roles.detailsGrants') }}
            </h3>
            <MongocampGrantList :grants="detail.grants" />
          </section>
        </div>
      </template>
    </USlideover>
  </div>
</template>
