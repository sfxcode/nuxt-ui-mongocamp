import type { H3Event } from 'h3'
import { createError, defineEventHandler, getRequestURL, proxyRequest } from 'h3'
import { useNitroApp, useRuntimeConfig } from 'nitropack/runtime'
import { consola } from 'consola'

// `NitroApp['hooks']` is a `Hookable<NitroRuntimeHooks>` — a closed set of hook names known
// to `nitropack/types`. This module's guard hook isn't (and doesn't need to be) part of that
// interface, so `callHook` is reached through this narrow local type instead of an `any` cast.
interface MongocampProxyHooks {
  callHook: (name: 'mongocamp-proxy:authorize', event: H3Event) => Promise<unknown>
}

// Set once per server process the first time a request finds no `mongocamp-proxy:authorize`
// listener registered — avoids re-warning on every proxied request.
let warnedMissingAuthorizeHook = false

function hasAuthorizeHookRegistered(hooks: MongocampProxyHooks): boolean {
  // `Hookable#_hooks` is TS-private but a real, stable runtime property (unjs/hookable has no
  // public listener-count API) — read defensively so a shape change fails open (assume a hook
  // IS registered) rather than spamming a false-positive warning.
  const bag = (hooks as unknown as { _hooks?: Record<string, unknown[]> })._hooks
  if (!bag) return true
  return (bag['mongocamp-proxy:authorize']?.length ?? 0) > 0
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const options = config.public.nuxtUiMongocampOptions

  if (!options?.useServerProxy) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const nitroHooks = useNitroApp().hooks as unknown as MongocampProxyHooks

  if (!warnedMissingAuthorizeHook && !hasAuthorizeHookRegistered(nitroHooks)) {
    warnedMissingAuthorizeHook = true
    consola.warn(
      '[nuxt-ui-mongocamp] `useServerProxy` is enabled but no `mongocamp-proxy:authorize` hook is '
      + 'registered. The proxy route is unguarded: any caller who can reach it gets the full power '
      + 'of the configured MongoCamp api key. Register a guard from your own `server/plugins/*.ts` — '
      + 'see docs/guide/server-proxy-auth.md.',
    )
  }

  // No-op unless a consumer has registered `mongocamp-proxy:authorize` from their own
  // `server/plugins/*.ts` — a registered handler that throws rejects the request with
  // whatever error it threw (e.g. a `createError({ statusCode: 401 })`).
  await nitroHooks.callHook('mongocamp-proxy:authorize', event)

  // Stripped defensively in case a runtime env override (e.g.
  // NUXT_PUBLIC_NUXT_UI_MONGOCAMP_OPTIONS_SERVER_PROXY_PATH) reintroduces a trailing slash —
  // note that only the *build-time* value actually changes which route Nitro registers, so a
  // runtime override here must still match it or requests never reach this handler at all.
  const serverProxyPath = (options.serverProxyPath ?? '/api/_mongocamp').replace(/\/+$/, '')
  const mongocampUrl = config.public.mongocamp?.url
  const apiKey = config.mongocampApiKey ?? ''

  if (!mongocampUrl) {
    throw createError({ statusCode: 500, statusMessage: 'nuxt-ui-mongocamp: `mongocamp.url` is not configured' })
  }
  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'nuxt-ui-mongocamp: `mongocamp.apiKey` is not configured for server proxy mode' })
  }

  const requestUrl = getRequestURL(event)
  const subPath = requestUrl.pathname.slice(serverProxyPath.length)
  const target = `${mongocampUrl}${subPath}${requestUrl.search}`

  return proxyRequest(event, target, {
    headers: {
      'X-AUTH-APIKEY': apiKey,
      // Neutralize any Authorization header the caller sent — auth against MongoCamp in
      // proxy mode must only ever come from the server-side api key above, never from
      // whatever a caller (legitimate or not) put on their own request.
      'Authorization': '',
    },
  })
})
