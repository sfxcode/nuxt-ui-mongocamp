<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n, useMongocampPaths } from '#imports'
import useMongocampAdmin from '../composables/useMongocampAdmin'
import {
  buildPermissionMatrix, cellLetters, collectionsNobodyCan, filterMatrix, matrixToCsvRows, QUICK_VIEWS, usersWithoutRoles,
} from '../utils/permissionMatrix'
import type { Cell, MatrixFilter, PermissionMatrix, QuickView } from '../utils/permissionMatrix'
import { downloadTextFile, rowsToCsv } from '../utils/exportRows'
import { isBucketMemberCollection } from '../utils/collectionProtection'

// Users × collections: what each user may do, worked out from the roles' grants the way the server does (union of the
// roles' collection grants, names matched ignoring case, an administrator may do everything). Read-only — grants are edited
// per role in MongocampRoleGrants. Letters carry the meaning (R W A), colour only supports it.
const props = withDefaults(defineProps<{
  // base path of the grant page of a role (`<grantsPath>/<role>`), as in MongocampRoles
  grantsPath?: string
  // at most this many collections (columns) and users (rows) are drawn; the filter narrows them
  maxCollections?: number
  maxUsers?: number
  // hide the component's own heading, e.g. when the page around it already shows a title
  hideHeading?: boolean
  // hide the component's own reload button, e.g. when the page calls the exposed `refresh()` from its own header
  hideRefresh?: boolean
}>(), {
  hideHeading: false,
  maxCollections: 60,
  maxUsers: 200,
})

const { t } = useI18n()
const paths = useMongocampPaths()
const { listUsers, listRoles, listCollections } = useMongocampAdmin()

const matrix = ref<PermissionMatrix | null>(null)
const roleNames = ref<string[]>([])
const loading = ref(false)
const loadError = ref<unknown>(null)

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const [users, roles, collections] = await Promise.all([listUsers(), listRoles(), listCollections()])
    // MongoCamp's own `mc_*` collections are not part of anyone's grants
    matrix.value = buildPermissionMatrix(users, roles, collections.filter(name => !name.startsWith('mc_')))
    roleNames.value = roles.map(role => role.name).sort((a, b) => a.localeCompare(b))
  }
  catch (e: unknown) {
    loadError.value = e
    matrix.value = null
  }
  finally {
    loading.value = false
  }
}
void load()

// ---- filters --------------------------------------------------------------------------------------------

// the select cannot hold an empty value, so "all roles" has its own
const ALL_ROLES = '__all__'
const text = ref('')
const role = ref(ALL_ROLES)
const view = ref<QuickView>('all')
const swapped = ref(false)

const filter = computed<MatrixFilter>(() => ({ text: text.value, role: role.value === ALL_ROLES ? undefined : role.value, view: view.value }))
const shown = computed(() => (matrix.value ? filterMatrix(matrix.value, filter.value) : null))
const users = computed(() => shown.value?.users.slice(0, props.maxUsers) ?? [])
const collections = computed(() => shown.value?.collections.slice(0, props.maxCollections) ?? [])

const roleItems = computed(() => [{ value: ALL_ROLES, label: t('nuxtUiMongocamp.permissionMatrix.roleAll') }, ...roleNames.value.map(name => ({ value: name, label: name }))])
const viewCounts = computed<Record<QuickView, number | undefined>>(() => {
  const m = matrix.value
  if (!m) return { 'all': undefined, 'users-without-roles': undefined, 'collections-nobody-writes': undefined, 'collections-nobody-reads': undefined }
  return {
    'all': undefined,
    'users-without-roles': usersWithoutRoles(m).length,
    'collections-nobody-writes': collectionsNobodyCan(m, 'write').length,
    'collections-nobody-reads': collectionsNobodyCan(m, 'read').length,
  }
})
const VIEW_KEYS: Record<QuickView, string> = { 'all': 'viewAll', 'users-without-roles': 'viewNoRoles', 'collections-nobody-writes': 'viewNobodyWrites', 'collections-nobody-reads': 'viewNobodyReads' }
const viewLabel = (v: QuickView) => t(`nuxtUiMongocamp.permissionMatrix.${VIEW_KEYS[v]}`)

// ---- cells ----------------------------------------------------------------------------------------------

function cellOf(userName: string, collection: string): Cell | undefined {
  return matrix.value?.cells[userName]?.[collection]
}

function cellTitle(cell: Cell): string {
  if (cell.admin) return t('nuxtUiMongocamp.permissionMatrix.cellAdmin')
  const allowed = (['read', 'write', 'administrate'] as const).filter(p => cell[p] === true).map(p => t(`nuxtUiMongocamp.permissionMatrix.cell${p.charAt(0).toUpperCase()}${p.slice(1)}`))
  if (cell.read === undefined && cell.write === undefined && cell.administrate === undefined) return t('nuxtUiMongocamp.permissionMatrix.cellUnknown')
  if (allowed.length === 0) return t('nuxtUiMongocamp.permissionMatrix.cellNone')
  // which roles give it; a grant that sits on the user itself has no role
  const via = cell.via.length > 0 ? t('nuxtUiMongocamp.permissionMatrix.via', { roles: cell.via.join(', ') }) : t('nuxtUiMongocamp.permissionMatrix.viaDirect')
  return `${allowed.join(', ')} — ${via}`
}

function cellClass(cell: Cell): string {
  if (cell.admin) return 'font-semibold text-highlighted'
  const any = cell.read === true || cell.write === true || cell.administrate === true
  return any ? 'text-default' : 'text-dimmed'
}

// rows and columns: users × collections, or swapped
const rowLabels = computed(() => (swapped.value ? collections.value : users.value.map(u => u.name)))
const columnLabels = computed(() => (swapped.value ? users.value.map(u => u.name) : collections.value))
function cellAtRowColumn(row: string, column: string): Cell | undefined {
  return swapped.value ? cellOf(column, row) : cellOf(row, column)
}
const userByName = computed(() => new Map((matrix.value?.users ?? []).map(u => [u.name, u])))
const hasBucketParts = computed(() => collections.value.some(isBucketMemberCollection))

function exportCsv() {
  if (!shown.value) return
  const { keys, rows } = matrixToCsvRows({ ...shown.value, users: users.value, collections: collections.value })
  downloadTextFile(`permissions-${new Date().toISOString().slice(0, 10)}.csv`, rowsToCsv(rows, keys), 'text/csv')
}

defineExpose({ refresh: load })
</script>

<template>
  <div
    class="flex flex-col gap-4"
    data-test="permission-matrix"
  >
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div
        v-if="!hideHeading"
        class="flex flex-col gap-1"
      >
        <h2 class="text-xl font-semibold">
          {{ t('nuxtUiMongocamp.permissionMatrix.heading') }}
        </h2>
        <p class="text-sm text-dimmed">
          {{ t('nuxtUiMongocamp.permissionMatrix.subtitle') }}
        </p>
      </div>
      <div class="ml-auto flex items-center gap-1">
        <UButton
          icon="i-lucide-arrow-left-right"
          color="neutral"
          variant="ghost"
          :aria-pressed="swapped"
          :aria-label="t('nuxtUiMongocamp.permissionMatrix.swap')"
          :disabled="!matrix"
          @click="swapped = !swapped"
        />
        <UButton
          icon="i-lucide-download"
          color="neutral"
          variant="ghost"
          :aria-label="t('nuxtUiMongocamp.permissionMatrix.exportCsv')"
          :disabled="!shown || users.length === 0 || collections.length === 0"
          @click="exportCsv"
        />
        <UButton
          v-if="!hideRefresh"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          :loading="loading"
          :aria-label="t('nuxtUiMongocamp.permissionMatrix.refresh')"
          @click="load"
        />
        <slot name="toolbar" />
      </div>
    </div>

    <MongocampErrorAlert
      :error="loadError"
      @retry="load"
    />

    <template v-if="matrix">
      <div class="flex flex-wrap items-center gap-2">
        <UInput
          v-model="text"
          icon="i-lucide-search"
          size="sm"
          class="w-64"
          :placeholder="t('nuxtUiMongocamp.permissionMatrix.filterPlaceholder')"
          :aria-label="t('nuxtUiMongocamp.permissionMatrix.filterPlaceholder')"
        />
        <USelect
          v-model="role"
          :items="roleItems"
          size="sm"
          class="w-44"
          :aria-label="t('nuxtUiMongocamp.permissionMatrix.roleLabel')"
        />
        <div
          class="flex flex-wrap items-center gap-1"
          role="group"
          :aria-label="t('nuxtUiMongocamp.permissionMatrix.viewLabel')"
        >
          <UButton
            v-for="v in QUICK_VIEWS"
            :key="v"
            size="xs"
            color="neutral"
            :variant="view === v ? 'subtle' : 'ghost'"
            :aria-pressed="view === v"
            :label="viewCounts[v] === undefined ? viewLabel(v) : `${viewLabel(v)} (${viewCounts[v]})`"
            :data-test="`view-${v}`"
            @click="view = v"
          />
        </div>
      </div>

      <p class="text-xs text-dimmed">
        <span data-test="matrix-summary">{{ t('nuxtUiMongocamp.permissionMatrix.summary', { users: users.length, collections: collections.length }) }}</span>
        · {{ t('nuxtUiMongocamp.permissionMatrix.legend') }}
      </p>
      <p
        v-if="view === 'collections-nobody-writes' || view === 'collections-nobody-reads'"
        class="text-xs text-dimmed"
      >
        {{ t('nuxtUiMongocamp.permissionMatrix.nobodyNote') }}
      </p>
      <p
        v-if="shown && shown.collections.length > collections.length"
        class="text-sm text-warning"
        data-test="capped-collections"
      >
        {{ t('nuxtUiMongocamp.permissionMatrix.cappedCollections', { shown: collections.length, total: shown.collections.length }) }}
      </p>
      <p
        v-if="shown && shown.users.length > users.length"
        class="text-sm text-warning"
        data-test="capped-users"
      >
        {{ t('nuxtUiMongocamp.permissionMatrix.cappedUsers', { shown: users.length, total: shown.users.length }) }}
      </p>

      <p
        v-if="matrix.users.length === 0 && matrix.collections.length === 0"
        class="text-sm text-dimmed"
      >
        {{ t('nuxtUiMongocamp.permissionMatrix.nothingLoaded') }}
      </p>
      <p
        v-else-if="rowLabels.length === 0 || columnLabels.length === 0"
        class="text-sm text-dimmed"
        data-test="matrix-empty"
      >
        {{ users.length === 0 ? t('nuxtUiMongocamp.permissionMatrix.noUsers') : t('nuxtUiMongocamp.permissionMatrix.noCollections') }}
      </p>
      <div
        v-else
        class="overflow-auto rounded-md border border-default"
      >
        <table
          class="w-max min-w-full border-collapse text-sm"
          data-test="matrix-table"
        >
          <thead>
            <tr class="bg-elevated/50">
              <th class="sticky left-0 z-10 bg-default px-3 py-2 text-left font-medium">
                {{ swapped ? t('nuxtUiMongocamp.permissionMatrix.columnCollection') : t('nuxtUiMongocamp.permissionMatrix.columnUser') }}
              </th>
              <th
                v-for="column in columnLabels"
                :key="column"
                class="max-w-40 truncate px-2 py-2 text-center font-medium"
                :title="column"
                scope="col"
              >
                {{ column }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rowLabels"
              :key="row"
              class="border-t border-default"
              :data-row="row"
            >
              <th
                class="sticky left-0 z-10 bg-default px-3 py-1.5 text-left font-medium"
                scope="row"
              >
                <div class="flex flex-wrap items-center gap-1">
                  <span>{{ row }}</span>
                  <template v-if="!swapped && userByName.get(row)">
                    <UBadge
                      v-if="userByName.get(row)!.admin"
                      :label="t('nuxtUiMongocamp.permissionMatrix.adminBadge')"
                      color="primary"
                      variant="subtle"
                      size="sm"
                    />
                    <NuxtLink
                      v-for="roleName in userByName.get(row)!.roles"
                      :key="roleName"
                      :to="`${grantsPath ?? paths.roles}/${roleName}`"
                      class="rounded bg-elevated px-1.5 py-0.5 text-xs hover:underline"
                      :class="userByName.get(row)!.unknownRoles.includes(roleName) ? 'text-warning' : 'text-dimmed'"
                      :title="userByName.get(row)!.unknownRoles.includes(roleName) ? t('nuxtUiMongocamp.permissionMatrix.unknownRoleNote') : t('nuxtUiMongocamp.permissionMatrix.openRole', { role: roleName })"
                    >
                      {{ roleName }}
                    </NuxtLink>
                  </template>
                </div>
              </th>
              <td
                v-for="column in columnLabels"
                :key="column"
                class="px-2 py-1.5 text-center"
              >
                <template v-if="cellAtRowColumn(row, column)">
                  <span
                    class="font-mono text-xs"
                    :class="cellClass(cellAtRowColumn(row, column)!)"
                    :title="cellTitle(cellAtRowColumn(row, column)!)"
                    :data-cell="`${swapped ? column : row}|${swapped ? row : column}`"
                  >{{ cellLetters(cellAtRowColumn(row, column)!) }}</span>
                  <span class="sr-only">{{ cellTitle(cellAtRowColumn(row, column)!) }}</span>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p
        v-if="hasBucketParts"
        class="text-xs text-dimmed"
      >
        {{ t('nuxtUiMongocamp.permissionMatrix.bucketNote') }}
      </p>
    </template>
  </div>
</template>
