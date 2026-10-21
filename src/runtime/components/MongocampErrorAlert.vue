<script setup lang='ts'>
import { computed, ref, watch } from 'vue'
import { navigateTo, useI18n, useMongocampError, useMongocampRoles, useMongocampSession } from '#imports'
import { classifyFailure } from '../utils/failureKind'
import type { FailureKind } from '../utils/failureKind'

const props = defineProps<{
  error: unknown
  title?: string
  // where "Log in again" goes after clearing the session; defaults to the module's `loginPath` option
  loginPath?: string
  // set by a parent that has proven the request only fails because of the filter it sent (a retry
  // without the filter worked) — the browser reports a rejected filter exactly like a dead network
  filterRejected?: boolean
}>()

const emit = defineEmits<{ retry: [], clearFilters: [] }>()

const { t } = useI18n()
const { describeError } = useMongocampError()

const { diagnoseFailure, invalidateSession } = useMongocampSession()
const { loginPath: configuredLoginPath } = useMongocampRoles()

const described = computed(() => describeError(props.error))

// A token the server refuses is reported by the browser exactly like a dead network, so for a network
// failure the session is asked about (a shared, rate-limited check). Until the answer arrives — and when it
// is inconclusive — the plain network message stands.
const failure = ref<FailureKind | null>(null)
let diagnosisRun = 0

watch(() => [props.error, props.filterRejected] as const, async ([error, filterRejected]) => {
  const run = ++diagnosisRun
  failure.value = null
  if (!error || filterRejected) return
  const kind = await classifyFailure(describeError(error).kind, diagnoseFailure)
  if (run === diagnosisRun) failure.value = kind
}, { immediate: true })

const sessionGone = computed(() => described.value.kind === 'unauthorized' || failure.value === 'session-ended')
const requestRefused = computed(() => failure.value === 'rejected-request')

const description = computed(() => {
  if (props.filterRejected) return t('nuxtUiMongocamp.errors.filterRejected')
  if (sessionGone.value) return t('nuxtUiMongocamp.errors.unauthorized')
  if (requestRefused.value) return t('nuxtUiMongocamp.errors.requestRefused')
  return described.value.message
})

// The session has to be cleared *before* leaving: while the cookie still holds the dead token the app
// believes it is logged in, and a login page that redirects logged-in users would bounce straight back.
async function loginAgain() {
  await invalidateSession()
  await navigateTo(props.loginPath ?? configuredLoginPath)
}
</script>

<template>
  <UAlert
    v-if="error"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :title="filterRejected ? t('nuxtUiMongocamp.errors.filterRejectedTitle') : (title ?? t('nuxtUiMongocamp.errors.loadFailedTitle'))"
    :description="description"
  >
    <template #actions>
      <UButton
        v-if="filterRejected"
        :label="t('nuxtUiMongocamp.errors.clearFilters')"
        color="error"
        variant="subtle"
        icon="i-lucide-filter-x"
        @click="emit('clearFilters')"
      />
      <UButton
        v-else-if="sessionGone"
        :label="t('nuxtUiMongocamp.errors.loginAgain')"
        color="error"
        variant="subtle"
        icon="i-lucide-log-in"
        @click="loginAgain"
      />
      <UButton
        v-else
        :label="t('nuxtUiMongocamp.common.retry')"
        color="error"
        variant="subtle"
        icon="i-lucide-refresh-cw"
        @click="emit('retry')"
      />
    </template>
  </UAlert>
</template>
