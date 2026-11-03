import { parseServerError } from './aggregationErrors'

// MongoCamp server 1.6.x sends CORS headers on every error, so a refused request reaches the app as a readable
// `ResponseError` whose body is `{ code, msg, additionalInfo }`: `4031` an operator the server does not allow,
// `4011` unauthorised, `4001` an invalid body, `-1` anything else (brain/project/mongocamp-server-1-6-3-caveat-recheck.md).
export const OPERATOR_NOT_ALLOWED_CODE = 4031

export interface ServerError {
  /** HTTP status of the response, when there was one. */
  status?: number
  /** The server's own error code from the body. */
  code?: number
  /** The server's message with every database address removed (`parseServerError`); `undefined` when there is none. */
  message?: string
  /** `mongo` when the message is MongoDB's own text for a failed command. */
  kind?: 'mongo' | 'other'
}

/**
 * Reads what the server said about a failed request from the error the generated client threw. The client only
 * keeps the `Response`, so the body is read from a clone, best-effort: anything unreadable (no response, a network
 * failure, a non-JSON body such as a proxy's 503) just yields what is known. Never throws.
 */
export async function readServerError(error: unknown): Promise<ServerError> {
  const response = (error as { response?: Response } | null)?.response
  const status = typeof response?.status === 'number' ? response.status : undefined
  if (!response || typeof response.clone !== 'function') return { status }
  try {
    const body = await response.clone().json() as { code?: unknown, msg?: unknown } | null
    const code = typeof body?.code === 'number' ? body.code : undefined
    if (typeof body?.msg !== 'string' || !body.msg) return { status, code }
    const info = parseServerError(body.msg)
    return { status, code, message: info.message || undefined, kind: info.kind }
  }
  catch {
    return { status }
  }
}

/** `$function` out of "the operator $function is not allowed in an aggregation" (code 4031). */
export function notAllowedOperator(message: string | undefined): string | undefined {
  return /operator (\$[A-Za-z]+) is not allowed/.exec(message ?? '')?.[1]
}
