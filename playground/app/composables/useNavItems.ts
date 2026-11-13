import type { NavigationMenuItem } from '@nuxt/ui'

// The module's own pages come from `useMongocampNavigation()` (role-aware, translated, built on the `paths` option);
// the playground only adds its manager page, which the module knows nothing about.
export function useNavItems() {
  const { menu } = useMongocampNavigation()
  const { canSeeManagement } = useMongocampRoles()

  return computed<NavigationMenuItem[][]>(() => {
    const [main = [], ...admin] = menu.value
    return [
      [...main, ...(canSeeManagement.value ? [{ label: 'Manager', icon: 'i-lucide-briefcase', to: '/secured/manager' }] : [])],
      ...admin,
    ]
  })
}
