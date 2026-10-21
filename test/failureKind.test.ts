import { describe, it, expect, vi } from 'vitest'
import { classifyFailure } from '../src/runtime/utils/failureKind'
import type { SessionState } from '../src/runtime/composables/useMongocampSession'

const diagnose = (state: SessionState) => vi.fn(() => Promise.resolve(state))

describe('classifyFailure', () => {
  it('a readable 401 is a finished session, without asking anything', async () => {
    const d = diagnose('active')

    expect(await classifyFailure('unauthorized', d)).toBe('session-ended')
    expect(d).not.toHaveBeenCalled()
  })

  it.each(['forbidden', 'other'] as const)('%s errors are not about the session and are not diagnosed', async (kind) => {
    const d = diagnose('rejected')

    expect(await classifyFailure(kind, d)).toBe('other')
    expect(d).not.toHaveBeenCalled()
  })

  it.each([
    ['expired', 'session-ended'],
    ['rejected', 'session-ended'],
    ['active', 'rejected-request'],
    ['unknown', 'network'],
  ] as const)('a network failure diagnosed as %s is %s', async (state, expected) => {
    expect(await classifyFailure('network', diagnose(state))).toBe(expected)
  })

  it('falls back to a plain network failure when the diagnosis itself throws', async () => {
    const d = vi.fn(() => Promise.reject(new Error('boom')))

    expect(await classifyFailure('network', d)).toBe('network')
  })
})
