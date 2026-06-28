<script setup lang="ts">
const { isLoggedIn } = useMongocampAuth()
</script>

<template>
  <UHeader title="Nuxt UI MongoCamp">
    <template #right>
      <UColorModeButton />
      <UButton
        v-if="isLoggedIn"
        label="Logout"
        icon="i-lucide-log-out"
        color="neutral"
        variant="ghost"
        to="/logout"
      />
    </template>
  </UHeader>
</template>
