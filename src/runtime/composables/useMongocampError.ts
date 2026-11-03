import { useI18n } from '#imports'
import { notAllowedOperator, OPERATOR_NOT_ALLOWED_CODE, readServerError } from '../utils/serverError'

// `notAllowed`: the server refused an operator (code 4031). `invalid`: the server rejected the request body or
// filter (400) and said why.
export type MongocampErrorKind = 'network' | 'unauthorized' | 'forbidden' | 'notAllowed' | 'invalid' | 'other'

export interface DescribedError {
  kind: MongocampErrorKind
  message: string
}

// Maps whatever a MongoCamp API call threw to something showable. The generated client throws a
// `FetchError` when the request itself fails (offline, or a rejected response the browser hides
// behind CORS — which is what a dead session looks like) and a `ResponseError` carrying the HTTP
// status otherwise.
export function useMongocampError() {
  const { t } = useI18n()

  function describeError(error: unknown, fallbackKey?: string): DescribedError {
    const name = (error as { name?: string } | null)?.name
    const status = (error as { response?: { status?: number } } | null)?.response?.status

    if (name === 'FetchError') {
      return { kind: 'network', message: t('nuxtUiMongocamp.errors.network') }
    }
    if (status === 401) {
      return { kind: 'unauthorized', message: t('nuxtUiMongocamp.errors.unauthorized') }
    }
    if (status === 403) {
      return { kind: 'forbidden', message: t('nuxtUiMongocamp.errors.forbidden') }
    }
    const message = error instanceof Error && error.message
      ? error.message
      : t(fallbackKey ?? 'nuxtUiMongocamp.errors.generic')
    return { kind: 'other', message }
  }

  // Like `describeError`, but also reads the server's `{ code, msg }` body (async, one clone of the response) so a
  // refused operator, an invalid filter or a 404 say what the server said instead of a generic text. The message is
  // already stripped of database addresses. 401, 403 and network failures keep their fixed messages.
  async function describeServerError(error: unknown, fallbackKey?: string): Promise<DescribedError> {
    const base = describeError(error, fallbackKey)
    if (base.kind === 'network' || base.kind === 'unauthorized') return base
    const server = await readServerError(error)
    if (server.code === OPERATOR_NOT_ALLOWED_CODE) {
      const operator = notAllowedOperator(server.message)
      return { kind: 'notAllowed', message: operator ? t('nuxtUiMongocamp.errors.notAllowedOperator', { operator }) : t('nuxtUiMongocamp.errors.notAllowed') }
    }
    if (base.kind === 'forbidden') return base
    if (server.message && server.status !== undefined && server.status >= 400) {
      return { kind: server.status === 400 ? 'invalid' : 'other', message: server.message }
    }
    return base
  }

  return { describeError, describeServerError }
}
