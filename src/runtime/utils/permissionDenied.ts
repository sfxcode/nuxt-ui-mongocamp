import type { Middleware, ResponseContext } from '@sfxcode/nuxt-mongocamp-server/api'

// MongoCamp server 1.6.3 and — by default — 1.8.1 answer a request the user has no grant for — a collection without a grant, a write with a
// read-only grant, every admin-only endpoint — with HTTP **401**, code 4011, and a message that says what was
// missing (`user not authorized for collection`, `… for bucket`, `… for request`). A token that really is dead gets the
// same code with the plain message `user not authorized` (verified with a throwaway non-admin user, 2026-11-03,
// brain/project/mongocamp-server-1-6-3-caveat-recheck.md). Since 1.7.0 the status is the operator's choice
// (`AUTH_GRANT_DENIED_STATUS`, `401` or `403`, default `401`, `403` planned for the next major version): with `403`
// this middleware simply never fires, so it stays until the default changes (server docs, api-behaviour.md).
//
// The dependency's API middleware clears the stored session on *any* 401 ("a 401 means the token itself is invalid"),
// and leaves a 403 alone ("authenticated but missing a grant"). So one forbidden request logged a non-admin user out
// and the alert said their session had expired. This middleware runs before the dependency's and rewrites exactly the
// permission 401 into the 403 it should have been; a dead token stays a 401.

const NOT_AUTHORIZED_CODE = 4011

/** `true` for the body of a 401 that names what the user may not do, `false` for a dead token or anything else. */
export function isPermissionDeniedBody(status: number, body: unknown): boolean {
  if (status !== 401 || typeof body !== 'object' || body === null) return false
  const { code, msg } = body as { code?: unknown, msg?: unknown }
  return code === NOT_AUTHORIZED_CODE && typeof msg === 'string' && /^user not authorized for\b/i.test(msg.trim())
}

export const permissionDeniedMiddleware: Middleware = {
  post: async ({ response }: ResponseContext): Promise<Response | undefined> => {
    if (response.status !== 401) return undefined
    try {
      const text = await response.clone().text()
      if (!isPermissionDeniedBody(401, JSON.parse(text))) return undefined
      return new Response(text, { status: 403, statusText: 'Forbidden', headers: new Headers(response.headers) })
    }
    catch {
      // no readable JSON body: keep the 401 — an unreadable refusal is treated as the dead-token case it has always been
      return undefined
    }
  },
}

/**
 * Puts the middleware first in the list the dependency's API instances share (they are all built from one
 * `Configuration`, so one array). Safe to call on anything: a test double without a `middleware` array is left alone,
 * and a list that already has it is not changed.
 */
export function installPermissionDeniedMiddleware<T extends object>(apis: T): T {
  const list = (apis as { adminApi?: { middleware?: unknown } }).adminApi?.middleware
  if (Array.isArray(list) && !list.includes(permissionDeniedMiddleware)) list.unshift(permissionDeniedMiddleware)
  return apis
}
