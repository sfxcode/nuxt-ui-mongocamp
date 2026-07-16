import type { H3Event } from 'h3'
import { createError, defineEventHandler, getRequestURL, proxyRequest } from 'h3'
import { useNitroApp, useRuntimeConfig } from 'nitropack/runtime'

// `NitroApp['hooks']` is a `Hookable<NitroRuntimeHooks>` — a closed set of hook names known
// to `nitropack/types`. This module's guard hook isn't (and doesn't need to be) part of that
// interface, so `callHook` is reached through this narrow local type instead of an `any` cast.
interface MongocampProxyHooks {
  callHook: (name: 'mongocamp-proxy:authorize', event: H3Event) => Promise<unknown>
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const options = config.public.nuxtUiMongocampOptions

  if (!options?.useServerProxy) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  // No-op unless a consumer has registered `mongocamp-proxy:authorize` from their own
  // `server/plugins/*.ts` — a registered handler that throws rejects the request with
  // whatever error it threw (e.g. a `createError({ statusCode: 401 })`).
  const hooks = useNitroApp().hooks as unknown as MongocampProxyHooks
  await hooks.callHook('mongocamp-proxy:authorize', event)

  const serverProxyPath = options.serverProxyPath ?? '/api/_mongocamp'
  const mongocampUrl = config.public.mongocamp?.url
  const apiKey = config.mongocampApiKey ?? ''

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
