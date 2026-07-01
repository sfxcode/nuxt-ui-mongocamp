<script setup lang='ts'>
import { h, reactive, ref, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import type { JobConfig, JobInformation } from '@sfxcode/nuxt-mongocamp-server'
import { useMongocampJobs, useToast } from '#imports'

const { listJobs, listPossibleJobs, registerJob, updateJob, executeJob, deleteJob } = useMongocampJobs()
const toast = useToast()

const jobs = ref<JobInformation[]>([])
const loading = ref(false)
const sorting = ref<{ id: string, desc: boolean }[]>([])
const isAddModalOpen = ref(false)
const isEditModalOpen = ref(false)
const isDeleteModalOpen = ref(false)
const errorMessage = ref('')
const executingJobs = ref<Set<string>>(new Set())

function jobKey(group: string, name: string): string {
  return `${group}/${name}`
}

async function fetchJobs() {
  loading.value = true
  try {
    jobs.value = await listJobs()
  }
  finally {
    loading.value = false
  }
}

const emptyJobConfig = (): JobConfig => ({ name: '', group: '', className: '', description: '', cronExpression: '', priority: 5 })

const newJob = ref<JobConfig>(emptyJobConfig())

const editJobOriginal = ref({ group: '', name: '' })
const editJobClassName = ref('')
const editJob = ref<Omit<JobConfig, 'className'>>({ name: '', group: '', description: '', cronExpression: '', priority: 5 })

function extractSelectValue(raw: unknown): string {
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as { value?: string, label?: string }
    return obj.value ?? obj.label ?? ''
  }
  return String(raw ?? '')
}

const addJobSchema = reactive([
  {
    $formkit: 'nuxtUIInput',
    name: 'name',
    label: 'Name',
    validation: 'required',
  },
  {
    $formkit: 'nuxtUIInput',
    name: 'group',
    label: 'Group',
    validation: 'required',
  },
  {
    $formkit: 'nuxtUISelectMenu',
    name: 'className',
    label: 'Job Class',
    options: [] as string[],
    validation: 'required',
  },
  {
    $formkit: 'nuxtUIInput',
    name: 'description',
    label: 'Description',
  },
  {
    $formkit: 'nuxtUIInput',
    name: 'cronExpression',
    label: 'Cron Expression',
    help: 'Quartz cron syntax, e.g. 0 0 * * * ?',
    validation: 'required',
  },
  {
    $formkit: 'nuxtUIInputNumber',
    name: 'priority',
    label: 'Priority',
  },
])

const editJobSchema = reactive([
  {
    $formkit: 'nuxtUIInput',
    name: 'name',
    label: 'Name',
    validation: 'required',
  },
  {
    $formkit: 'nuxtUIInput',
    name: 'group',
    label: 'Group',
    validation: 'required',
  },
  {
    $formkit: 'nuxtUIInput',
    name: 'description',
    label: 'Description',
  },
  {
    $formkit: 'nuxtUIInput',
    name: 'cronExpression',
    label: 'Cron Expression',
    help: 'Quartz cron syntax, e.g. 0 0 * * * ?',
    validation: 'required',
  },
  {
    $formkit: 'nuxtUIInputNumber',
    name: 'priority',
    label: 'Priority',
  },
])

async function openAdd() {
  errorMessage.value = ''
  addJobSchema[2]!.options = await listPossibleJobs()
  newJob.value = emptyJobConfig()
  isAddModalOpen.value = true
}

async function handleAddJob() {
  errorMessage.value = ''
  try {
    const className = extractSelectValue(newJob.value.className)
    await registerJob({ ...newJob.value, className })
    isAddModalOpen.value = false
    await fetchJobs()
  }
  catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to register job'
  }
}

function openEdit(job: JobInformation) {
  errorMessage.value = ''
  editJobOriginal.value = { group: job.group, name: job.name }
  editJobClassName.value = job.jobClassName
  editJob.value = {
    name: job.name,
    group: job.group,
    description: job.description,
    cronExpression: job.cronExpression,
    priority: job.priority,
  }
  isEditModalOpen.value = true
}

async function handleEditJob() {
  errorMessage.value = ''
  try {
    const jobConfig: JobConfig = { ...editJob.value, className: editJobClassName.value }
    await updateJob(editJobOriginal.value.group, editJobOriginal.value.name, jobConfig)
    isEditModalOpen.value = false
    await fetchJobs()
  }
  catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to update job'
  }
}

const jobToDelete = ref({ group: '', name: '' })

function confirmDelete(group: string, name: string) {
  jobToDelete.value = { group, name }
  isDeleteModalOpen.value = true
}

async function handleDeleteJob() {
  await deleteJob(jobToDelete.value.group, jobToDelete.value.name)
  isDeleteModalOpen.value = false
  await fetchJobs()
}

async function handleExecuteJob(group: string, name: string) {
  const key = jobKey(group, name)
  executingJobs.value.add(key)
  try {
    await executeJob(group, name)
    toast.add({ title: 'Job executed', description: `"${name}" was triggered.`, color: 'success' })
  }
  catch {
    toast.add({ title: 'Execution failed', description: `Could not execute "${name}".`, color: 'error' })
  }
  finally {
    executingJobs.value.delete(key)
  }
}

function formatFireTime(date?: Date): string {
  if (!date) return '—'
  return new Date(date).toLocaleString()
}

const UButton = resolveComponent('UButton')
const UTooltip = resolveComponent('UTooltip')

function withTooltip(text: string, node: ReturnType<typeof h>) {
  return h(UTooltip, { text }, { default: () => node })
}

function sortHeader(column: Column<JobInformation>, label: string) {
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

const columns: TableColumn<JobInformation>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => sortHeader(column, 'Name'),
  },
  {
    accessorKey: 'group',
    header: ({ column }) => sortHeader(column, 'Group'),
  },
  {
    accessorKey: 'cronExpression',
    header: 'Cron Expression',
    cell: ({ row }) => h('span', { class: 'font-mono text-xs' }, row.original.cronExpression),
  },
  {
    accessorKey: 'nextScheduledFireTime',
    header: 'Next Fire Time',
    cell: ({ row }) => h('span', formatFireTime(row.original.nextScheduledFireTime)),
  },
  {
    accessorKey: 'priority',
    header: ({ column }) => sortHeader(column, 'Priority'),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => {
      const key = jobKey(row.original.group, row.original.name)
      return h('div', { class: 'flex gap-1 justify-end' }, [
        withTooltip('Execute now', h(UButton, {
          'icon': 'i-lucide-play',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': 'Execute now',
          'loading': executingJobs.value.has(key),
          'onClick': () => handleExecuteJob(row.original.group, row.original.name),
        })),
        withTooltip('Edit job', h(UButton, {
          'icon': 'i-lucide-pencil',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': 'Edit job',
          'onClick': () => openEdit(row.original),
        })),
        withTooltip('Delete job', h(UButton, {
          'icon': 'i-lucide-trash-2',
          'color': 'error',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': 'Delete job',
          'onClick': () => confirmDelete(row.original.group, row.original.name),
        })),
      ])
    },
  },
]

fetchJobs()
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <h2 class="text-xl font-semibold">
        Jobs
      </h2>
      <div class="flex items-center gap-2">
        <UTooltip text="Refresh">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loading"
            aria-label="Refresh"
            @click="fetchJobs"
          />
        </UTooltip>
        <UButton
          icon="i-lucide-plus"
          label="Add Job"
          @click="openAdd"
        />
      </div>
    </div>

    <UTable
      v-model:sorting="sorting"
      :data="jobs"
      :columns="columns"
      :loading="loading"
    />

    <!-- Add Job Modal -->
    <UModal
      v-model:open="isAddModalOpen"
      title="Add Job"
    >
      <template #body>
        <FUDataEdit
          :data="newJob"
          :schema="addJobSchema"
          submit-label="Add Job"
          submit-icon="i-lucide-plus"
          @data-saved="handleAddJob"
        />
        <p
          v-if="errorMessage"
          class="mt-2 text-sm text-error-500"
        >
          {{ errorMessage }}
        </p>
      </template>
    </UModal>

    <!-- Edit Job Modal -->
    <UModal
      v-model:open="isEditModalOpen"
      :title="`Edit Job: ${editJobOriginal.name}`"
    >
      <template #body>
        <FUDataEdit
          :data="editJob"
          :schema="editJobSchema"
          submit-label="Save Changes"
          submit-icon="i-lucide-save"
          @data-saved="handleEditJob"
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
      title="Delete Job"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p>
          Are you sure you want to delete job <strong>{{ jobToDelete.name }}</strong>?
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
          icon="i-lucide-trash-2"
          @click="handleDeleteJob"
        />
      </template>
    </UModal>
  </div>
</template>
