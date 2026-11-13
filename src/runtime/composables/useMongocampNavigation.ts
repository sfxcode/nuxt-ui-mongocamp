import { useI18n, useMongocampPaths, useMongocampRoles } from '#imports'
import { computed } from 'vue'
import { buildNavigation } from '../utils/navigation'
import type { NavigationGroup } from '../utils/navigation'
import type { MongocampPaths } from '../utils/paths'

export interface MongocampNavigationItem {
  /** Stable id of the page — its key in the module's `paths` option. */
  key: keyof MongocampPaths
  label: string
  icon: string
  to: string
  exact?: boolean
}

export interface MongocampNavigationGroup {
  key: NavigationGroup['key']
  label?: string
  items: MongocampNavigationItem[]
}

type MenuRow = MongocampNavigationItem | { type: 'label', label: string }

/**
 * The module's pages as role-aware navigation data, from the module option `paths`: Home and Account for everyone (no
 * Account in server proxy mode), the admin pages in three groups (data, access, server) for whoever may see them
 * (`canSeeAdmin`). Labels follow the current locale.
 *
 * `groups` is the plain structure; `menu` is the same in the shape `UNavigationMenu`'s `items` takes (one array per group,
 * a `{ type: 'label' }` row first where the group has a label). Add your own pages by spreading either.
 */
export function useMongocampNavigation() {
  const { t } = useI18n()
  const paths = useMongocampPaths()
  const { canSeeAdmin, isProxyMode } = useMongocampRoles()

  const groups = computed<MongocampNavigationGroup[]>(() =>
    buildNavigation(paths, { canSeeAdmin: canSeeAdmin.value, isProxyMode }).map(group => ({
      key: group.key,
      ...(group.labelKey ? { label: t(group.labelKey) } : {}),
      items: group.items.map(({ labelKey, ...item }) => ({ ...item, label: t(labelKey) })),
    })))

  const menu = computed<MenuRow[][]>(() =>
    groups.value.map(group => [...(group.label ? [{ type: 'label' as const, label: group.label }] : []), ...group.items]))

  return { groups, menu }
}
