import { useI18n } from '#imports'

export type MongocampErrorKind = 'network' | 'unauthorized' | 'forbidden' | 'other'

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

  return { describeError }
}
