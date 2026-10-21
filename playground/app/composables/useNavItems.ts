import type { NavigationMenuItem } from '@nuxt/ui'

export function useNavItems() {
  const { isAdmin, isManager } = useMongocampRoles()

  const baseItems: NavigationMenuItem[] = [
    { label: 'Home', icon: 'i-lucide-home', to: '/secured' },
    { label: 'Account', icon: 'i-lucide-user', to: '/secured/account' },
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
    { label: 'Settings', icon: 'i-lucide-settings', to: '/secured/admin/settings' },
  ]

  return computed<NavigationMenuItem[][]>(() => {
    const groups = [baseItems]
    if (isManager.value) groups.push(managerItems)
    if (isAdmin.value) groups.push(adminItems)
    return groups
  })
}
