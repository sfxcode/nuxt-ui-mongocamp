import { useRuntimeConfig } from '#app'
import { minimatch } from 'minimatch'
import { useMongocampAuth, useMongocampStorage } from '#imports'
import { computed } from 'vue'

export function useMongocampRoles() {
  const config = useRuntimeConfig()
  const { isLoggedIn } = useMongocampAuth()
  const state = useMongocampStorage()

  const notAllowedPath: string = config.public.nuxtUiMongocampOptions.notAllowedPath ?? '/'
  const logoutRedirectPath: string = config.public.nuxtUiMongocampOptions.logoutRedirectPath ?? '/'
  const logoutPath: string = config.public.nuxtUiMongocampOptions.logoutPath ?? '/logout'
  const managerRoles: string[] = config.public.nuxtUiMongocampOptions.managerRoles ?? []
  const securedRouteParts: string[] = config.public.nuxtUiMongocampOptions.securedRouteParts ?? []
  const managementRouteParts: string[] = config.public.nuxtUiMongocampOptions.managementRouteParts ?? []
  const adminRouteParts: string[] = config.public.nuxtUiMongocampOptions.adminRouteParts ?? []

  const isAdmin = computed(() => state.value?.profile?.isAdmin ?? false)
  const roles = computed(() => state.value?.profile?.roles ?? [])
  function matchesAnyRole(allowedRoles: string[]): boolean {
    return allowedRoles.some(role => roles.value.includes(role))
  }
  const isManager = computed(() => isAdmin.value || matchesAnyRole(managerRoles))

  function matchesAnyPattern(route: string, patterns: string[]): boolean {
    // A trailing-slash variant is also tried so a `/**` pattern covers the directory's own
    // index route (e.g. `/secured/**` matching `/secured` itself, not just `/secured/account`)
    // — minimatch treats `**` as requiring at least one more path segment otherwise.
    return patterns.some(pattern => minimatch(route, pattern) || minimatch(`${route}/`, pattern))
  }

  function isAllowedPathForRoute(route: string): boolean {
    // Always allowed, so the middleware's own redirect targets can never cause a loop.
    if (route === notAllowedPath || route === logoutRedirectPath) {
      return true
    }
    if (!isLoggedIn.value && matchesAnyPattern(route, securedRouteParts)) {
      return false
    }
    else if (!isManager.value && matchesAnyPattern(route, managementRouteParts)) {
      return false
    }
    // only if not already disallowed
    else if (!isAdmin.value && matchesAnyPattern(route, adminRouteParts)) {
      return false
    }
    return true
  }

  return { isLoggedIn, isAdmin, isManager, notAllowedPath, logoutRedirectPath, logoutPath, isAllowedPathForRoute }
}
