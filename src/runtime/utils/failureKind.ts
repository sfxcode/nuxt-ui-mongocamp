import type { SessionState } from '../composables/useMongocampSession'

// What a failed MongoCamp call turned out to be:
//   'session-ended'    — the login is gone (a readable 401, an expired token, or a token the server refuses)
//   'rejected-request' — the server is up and accepts our token; this one request was refused for its own reasons
//   'network'          — a network failure that could not be explained any further (server down, or unknown)
//   'other'            — not about the session or the network (403, a server message, ...)
export type FailureKind = 'session-ended' | 'rejected-request' | 'network' | 'other'

// `kind` is `describeError`'s verdict on the error; only a network failure needs the diagnosis, because the
// browser reports a token the server refused exactly like a dead network.
export async function classifyFailure(kind: 'network' | 'unauthorized' | 'forbidden' | 'other', diagnose: () => Promise<SessionState>): Promise<FailureKind> {
  if (kind === 'unauthorized') return 'session-ended'
  if (kind !== 'network') return 'other'
  try {
    const state = await diagnose()
    if (state === 'expired' || state === 'rejected') return 'session-ended'
    return state === 'active' ? 'rejected-request' : 'network'
  }
  catch {
    return 'network'
  }
}
