<script setup lang="ts">
</script>

<template>
  <UApp>
    <UHeader title="Nuxt UI MongoCamp" />
    <UMain>
      <NuxtLayout>
        <UContainer>
          <NuxtPage />
        </UContainer>
      </NuxtLayout>
    </UMain>

    <UFooter>
      <MongocampVersion />
    </UFooter>
  </UApp>
</template>

<style>
.formkit-label {
  @apply text-xs font-medium text-green-600 dark:text-green-400;
}

.formkit-help {
  @apply text-xs font-medium;
}

.formkit-message {
  @apply text-xs text-error;
}

.formkit-debug {
  @apply pt-2 text-xs;
}

.formkit-form {
  @apply space-y-3;
}
</style>
