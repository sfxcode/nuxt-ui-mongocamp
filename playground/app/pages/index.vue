<script setup>
const { isLoggedIn } = useMongocampAuth()

if (isLoggedIn.value) {
  await navigateTo('/secured')
}
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 pt-6">
    <MongocampLogin
      v-if="!isLoggedIn"
      redirect-path="/secured"
    />
  </div>
</template>
