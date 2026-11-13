<script setup lang="ts">
const { isLoggedIn } = useMongocampAuth()
const items = useNavItems()
const breadcrumbs = useMongocampBreadcrumbs()
</script>

<template>
  <div class="flex min-h-full">
    <MongocampCommandPalette v-if="isLoggedIn" />
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
      <MongocampServerStatus class="mt-4 border-t border-default px-2.5 pt-3" />
    </nav>
    <div class="flex-1 min-w-0">
      <UContainer>
        <UBreadcrumb
          v-if="isLoggedIn"
          :items="breadcrumbs"
          class="pt-3"
        />
        <slot />
      </UContainer>
    </div>
  </div>
</template>
