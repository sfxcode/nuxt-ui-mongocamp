// Build-time warnings about module option combinations that cannot work. Kept out of `module.ts` (which
// needs a Nuxt context) so the rules can be unit-tested.

interface WarnableOptions {
  useServerProxy?: boolean
  useGlobalAuthMiddleware?: boolean
  sessionGuard?: boolean
}

export function optionWarnings(options: WarnableOptions): string[] {
  const warnings: string[] = []
  if (options.useServerProxy && options.useGlobalAuthMiddleware) {
    warnings.push(
      '[nuxt-ui-mongocamp] `useServerProxy` and `useGlobalAuthMiddleware` are both enabled. '
      + 'Server proxy mode has no login/session, so `isLoggedIn`/`isAdmin`/`isManager` can never '
      + 'become true — every route matched by `securedRouteParts`, `managementRouteParts`, or '
      + '`adminRouteParts` will be permanently unreachable.',
    )
  }
  if (options.useServerProxy && options.sessionGuard) {
    warnings.push(
      '[nuxt-ui-mongocamp] `sessionGuard` has no effect together with `useServerProxy`: '
      + 'server proxy mode has no login, token or session to guard.',
    )
  }
  return warnings
}
