<script setup lang='ts'>
import { computed } from 'vue'
import { useI18n, useMongocampError } from '#imports'

const props = defineProps<{
  error: unknown
  title?: string
  loginPath?: string
}>()

const emit = defineEmits<{ retry: [] }>()

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
    :title="title ?? t('nuxtUiMongocamp.errors.loadFailedTitle')"
    :description="described.message"
  >
    <template #actions>
      <UButton
        v-if="sessionGone"
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
