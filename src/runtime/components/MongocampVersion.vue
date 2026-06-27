<script setup lang="ts">
import { computed } from 'vue'
import { useNuxtApp } from '#app'

const { $mongocampVersion } = useNuxtApp()

// `$mongocampVersion` is provided by the module's runtime plugin as a Ref
const version = computed(() => $mongocampVersion.value)
</script>

<template>
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
    MongoCamp unavailable
  </UBadge>
</template>
