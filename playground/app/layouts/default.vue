<script setup lang="ts">
const { isLoggedIn } = useMongocampAuth()
const items = useNavItems()
</script>

<template>
  <div class="flex min-h-full">
    <!-- below lg the nav lives in the header's mobile menu (AppHeader) instead -->
    <nav
      v-if="isLoggedIn"
      class="sticky top-16 hidden h-[calc(100vh-4rem)] w-52 shrink-0 border-r border-(--ui-border) p-3 lg:block"
    >
      <UNavigationMenu
        orientation="vertical"
        :items="items"
        class="w-full"
      />
    </nav>
    <div class="flex-1 min-w-0">
      <UContainer>
        <slot />
      </UContainer>
    </div>
  </div>
</template>
