import { describe, it, expect } from 'vitest'
import { optionWarnings } from '../src/optionWarnings'

describe('optionWarnings', () => {
  it('is quiet for the defaults and for each feature on its own', () => {
    expect(optionWarnings({})).toEqual([])
    expect(optionWarnings({ useGlobalAuthMiddleware: true })).toEqual([])
    expect(optionWarnings({ sessionGuard: true })).toEqual([])
    expect(optionWarnings({ useServerProxy: true })).toEqual([])
    expect(optionWarnings({ useGlobalAuthMiddleware: true, sessionGuard: true })).toEqual([])
  })

  it('warns that route protection can never unlock in server proxy mode', () => {
    const warnings = optionWarnings({ useServerProxy: true, useGlobalAuthMiddleware: true })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('permanently unreachable')
  })

  it('warns that sessionGuard does nothing in server proxy mode', () => {
    const warnings = optionWarnings({ useServerProxy: true, sessionGuard: true })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('`sessionGuard` has no effect')
  })

  it('reports both when all three are on', () => {
    expect(optionWarnings({ useServerProxy: true, useGlobalAuthMiddleware: true, sessionGuard: true })).toHaveLength(2)
  })
})
