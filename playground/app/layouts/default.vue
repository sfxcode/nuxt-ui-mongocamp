<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { isLoggedIn } = useMongocampAuth()

const items: NavigationMenuItem[][] = [
  [
    { label: 'Home', icon: 'i-lucide-home', to: '/' },
  ],
  [
    { type: 'label', label: 'Admin' },
    { label: 'Users', icon: 'i-lucide-users', to: '/secured/admin/users' },
    { label: 'Roles', icon: 'i-lucide-shield', to: '/secured/admin/roles' },
    { label: 'Collections', icon: 'i-lucide-database', to: '/secured/admin/collections' },
  ],
]
</script>

<template>
  <div class="flex min-h-full">
    <nav
      v-if="isLoggedIn"
      class="sticky top-16 h-[calc(100vh-4rem)] w-52 shrink-0 border-r border-(--ui-border) p-3"
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
