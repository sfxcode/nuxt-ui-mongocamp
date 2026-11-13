<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n, useMongocampProxyMode, useMongocampStorage, useMongocampSystem } from '#imports'
import { useNuxtApp } from '#app'

const props = withDefaults(defineProps<{
  /** Hide the MongoDB version badge (it is also hidden while the server cannot tell, e.g. before login or below server 1.9.0). */
  hideDatabase?: boolean
}>(), { hideDatabase: false })

const { t } = useI18n()
const { $mongocampVersion } = useNuxtApp()
const { getServerInfo } = useMongocampSystem()
const state = useMongocampStorage()
const isProxyMode = useMongocampProxyMode()

// `$mongocampVersion` is provided by the module's runtime plugin as a Ref
const version = computed(() => $mongocampVersion.value)

// `GET /system/info` needs a login (the version endpoint does not), so ask only once there is a session or in proxy
// mode, and never show an error: a server without the endpoint (< 1.9.0) or a refusal just leaves the badge out.
const mongoDbVersion = ref<string | null>(null)
const canAsk = computed(() => !props.hideDatabase && (isProxyMode || !!state.value?.profile))

watch(canAsk, async (ask) => {
  if (!ask) {
    mongoDbVersion.value = null
    return
  }
  try {
    mongoDbVersion.value = (await getServerInfo()).mongoDbVersion || null
  }
  catch {
    mongoDbVersion.value = null
  }
}, { immediate: true })
</script>

<template>
  <span class="inline-flex items-center gap-1.5">
    <UBadge
      v-if="version"
      color="primary"
      variant="subtle"
      icon="i-lucide-database"
    >
      {{ version.name }} v{{ version.version }}
    </UBadge>
    <UBadge
      v-else
      color="neutral"
      variant="subtle"
      icon="i-lucide-database-zap"
    >
      {{ t('nuxtUiMongocamp.version.unavailable') }}
    </UBadge>
    <UBadge
      v-if="mongoDbVersion"
      color="neutral"
      variant="subtle"
      icon="i-simple-icons-mongodb"
      data-testid="mongodb-version"
    >
      MongoDB {{ mongoDbVersion }}
    </UBadge>
  </span>
</template>
