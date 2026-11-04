<script setup lang="ts">
// Admin shell for collection and bucket pages: the default layout's frame plus a collection sidebar.
const { isLoggedIn } = useMongocampAuth()
const items = useNavItems()
</script>

<template>
  <div class="flex min-h-full">
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
    <aside class="sticky top-16 hidden h-[calc(100vh-4rem)] w-56 shrink-0 overflow-y-auto border-r border-(--ui-border) p-3 xl:block">
      <CollectionSidebar />
    </aside>
    <div class="flex-1 min-w-0">
      <MongocampCommandPalette v-if="isLoggedIn" />
      <UContainer>
        <slot />
      </UContainer>
    </div>
  </div>
</template>
