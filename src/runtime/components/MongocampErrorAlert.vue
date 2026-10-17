<script setup lang='ts'>
import { computed } from 'vue'
import { useI18n, useMongocampError } from '#imports'

const props = defineProps<{
  error: unknown
  title?: string
  loginPath?: string
  // set by a parent that has proven the request only fails because of the filter it sent (a retry
  // without the filter worked) — the browser reports a rejected filter exactly like a dead network
  filterRejected?: boolean
}>()

const emit = defineEmits<{ retry: [], clearFilters: [] }>()

const { t } = useI18n()
const { describeError } = useMongocampError()

const described = computed(() => describeError(props.error))
const sessionGone = computed(() => described.value.kind === 'unauthorized')
</script>

<template>
  <UAlert
    v-if="error"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :title="filterRejected ? t('nuxtUiMongocamp.errors.filterRejectedTitle') : (title ?? t('nuxtUiMongocamp.errors.loadFailedTitle'))"
    :description="filterRejected ? t('nuxtUiMongocamp.errors.filterRejected') : described.message"
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
        :to="loginPath ?? '/'"
        color="error"
        variant="subtle"
        icon="i-lucide-log-in"
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
