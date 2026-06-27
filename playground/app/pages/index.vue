<script setup>
const { isLoggedIn } = useMongocampAuth()
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 pt-6">
    Nuxt module playground! {{ new Date().toLocaleTimeString() }}
    <MongocampVersion />
    <MongocampLogin />
    {{ isLoggedIn }}
  </div>
</template>
