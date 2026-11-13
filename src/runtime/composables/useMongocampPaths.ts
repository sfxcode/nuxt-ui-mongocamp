import { useRuntimeConfig } from '#app'
import { resolvePaths } from '../utils/paths'
import type { MongocampPaths } from '../utils/paths'

/**
 * The base routes of the app's MongoCamp pages (module option `paths`, defaults `/secured/admin/...`). Every `*Path` prop of
 * the components falls back to these, so an app with other routes sets them once. Use it for your own links as well.
 */
export function useMongocampPaths(): MongocampPaths {
  // The generated runtime-config type lists only the options that have a module default; `paths` has none (see `module.ts`).
  const options = useRuntimeConfig().public.nuxtUiMongocampOptions as { paths?: unknown } | undefined
  return resolvePaths(options?.paths)
}
