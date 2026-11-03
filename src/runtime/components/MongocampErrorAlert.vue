<script setup lang='ts'>
import { computed, ref, watch } from 'vue'
import { navigateTo, useI18n, useMongocampError, useMongocampRoles, useMongocampSession } from '#imports'

const props = defineProps<{
  error: unknown
  title?: string
  // where "Log in again" goes after clearing the session; defaults to the module's `loginPath` option
  loginPath?: string
  // set by a parent that knows the request only fails because of the filter it sent (the server's 400)
  filterRejected?: boolean
}>()

const emit = defineEmits<{ retry: [], clearFilters: [] }>()

const { t } = useI18n()
const { describeError, describeServerError } = useMongocampError()

const { invalidateSession } = useMongocampSession()
const { loginPath: configuredLoginPath } = useMongocampRoles()

// Starts with the synchronous description and is upgraded once the server's own `{ code, msg }` body has been read
// (a refused operator, an invalid filter, a 404 say what the server said). A newer error wins over a slow lookup.
const described = ref(describeError(props.error))
watch(() => props.error, async (error) => {
  described.value = describeError(error)
  const withServerText = await describeServerError(error)
  if (props.error === error) described.value = withServerText
}, { immediate: true })

const sessionGone = computed(() => described.value.kind === 'unauthorized')

const description = computed(() => {
  if (props.filterRejected) {
    const reason = described.value.kind === 'invalid' ? ` ${t('nuxtUiMongocamp.errors.serverMessage', { message: described.value.message })}` : ''
    return t('nuxtUiMongocamp.errors.filterRejected') + reason
  }
  if (sessionGone.value) return t('nuxtUiMongocamp.errors.unauthorized')
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
