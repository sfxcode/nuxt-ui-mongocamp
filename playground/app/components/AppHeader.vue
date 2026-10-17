<script setup lang="ts">
const { isLoggedIn } = useMongocampAuth()
const items = useNavItems()
const { locale, setLocale } = useI18n()
</script>

<template>
  <UHeader title="Nuxt UI MongoCamp">
    <template #right>
      <UButton
        :label="locale.toUpperCase()"
        icon="i-lucide-languages"
        color="neutral"
        variant="ghost"
        aria-label="Switch language"
        @click="setLocale(locale === 'en' ? 'de' : 'en')"
      />
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

    <template #body>
      <UNavigationMenu
        v-if="isLoggedIn"
        orientation="vertical"
        :items="items"
        class="-mx-2.5"
      />
    </template>
  </UHeader>
</template>
