<script setup>
const { isLoggedIn } = useMongocampAuth()
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 pt-6">
    <MongocampLogin v-if="!isLoggedIn" />
    <UButton
      v-else
      label="Go to Admin"
      icon="i-lucide-layout-dashboard"
      to="/secured/admin"
    />
  </div>
</template>
