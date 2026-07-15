<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { isLoggedIn } = useMongocampAuth()
const { isAdmin, isManager } = useMongocampRoles()

const baseItems: NavigationMenuItem[][] = [
  [
    { label: 'Home', icon: 'i-lucide-home', to: '/secured' },
    { label: 'Account', icon: 'i-lucide-user', to: '/secured/account' },
  ],
]

const managerItems: NavigationMenuItem[] = [
  { type: 'label', label: 'Manager' },
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/secured/manager' },
]

const adminItems: NavigationMenuItem[] = [
  { type: 'label', label: 'Admin' },
  { label: 'Users', icon: 'i-lucide-users', to: '/secured/admin/users' },
  { label: 'Roles', icon: 'i-lucide-shield', to: '/secured/admin/roles' },
  { label: 'Collections', icon: 'i-lucide-database', to: '/secured/admin/collections' },
  { label: 'Jobs', icon: 'i-lucide-clock', to: '/secured/admin/jobs' },
  { label: 'Databases', icon: 'i-lucide-server', to: '/secured/admin/databases' },
]

const items = computed<NavigationMenuItem[][]>(() => {
  const groups = [...baseItems]
  if (isManager.value) groups.push(managerItems)
  if (isAdmin.value) groups.push(adminItems)
  return groups
})
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
