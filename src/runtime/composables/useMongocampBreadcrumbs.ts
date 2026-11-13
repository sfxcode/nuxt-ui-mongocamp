import { useI18n, useMongocampPaths, useRoute } from '#imports'
import { computed } from 'vue'
import { buildBreadcrumbs } from '../utils/navigation'

export interface MongocampBreadcrumbItem {
  label: string
  /** Absent on the last item — the current page. */
  to?: string
  icon?: string
}

/**
 * The breadcrumb of the current route among the module's pages (module option `paths`): Home › Collections ›
 * test_customer › Data. Section names follow the locale; a collection, bucket or role name is shown as it is in the URL.
 * A route outside every configured page is just Home. The items fit `UBreadcrumb`'s `items`.
 */
export function useMongocampBreadcrumbs() {
  const { t } = useI18n()
  const paths = useMongocampPaths()
  const route = useRoute()

  return computed<MongocampBreadcrumbItem[]>(() =>
    buildBreadcrumbs(route.path, paths).map(part => ({
      label: part.labelKey ? t(part.labelKey) : (part.text ?? ''),
      ...(part.to ? { to: part.to } : {}),
      ...(part.icon ? { icon: part.icon } : {}),
    })))
}
