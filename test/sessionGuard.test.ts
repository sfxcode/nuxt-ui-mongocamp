import { describe, it, expect, vi } from 'vitest'
import { runSessionGuard } from '../src/runtime/utils/sessionGuard'
import type { TokenExpiryState } from '../src/runtime/utils/jwtExpiry'

function setup(options: { expiry?: TokenExpiryState, allowed?: boolean, loginPath?: string } = {}) {
  const calls: string[] = []
  const invalidate = vi.fn(async () => {
    calls.push('invalidate')
  })
  const isAllowed = vi.fn((_path: string) => {
    calls.push('isAllowed')
    return options.allowed ?? true
  })
  const run = (path: string) => runSessionGuard({
    path,
    loginPath: options.loginPath ?? '/login',
    checkExpiry: () => options.expiry ?? 'valid',
    invalidate,
    isAllowed,
  })
  return { run, invalidate, isAllowed, calls }
}

describe('runSessionGuard', () => {
  it.each(['valid', 'unknown'] as const)('does nothing for a %s token — an unreadable token never logs anyone out', async (expiry) => {
    const { run, invalidate, isAllowed } = setup({ expiry })

    expect(await run('/secured')).toBe('continue')
    expect(invalidate).not.toHaveBeenCalled()
    expect(isAllowed).not.toHaveBeenCalled()
  })

  it('clears an expired session and redirects when the route is no longer allowed afterwards', async () => {
    const { run, invalidate, calls } = setup({ expiry: 'expired', allowed: false })

    expect(await run('/secured')).toBe('redirect')
    expect(invalidate).toHaveBeenCalledTimes(1)
    // the allowed-check must see the cleared session, so it runs after the invalidation
    expect(calls).toEqual(['invalidate', 'isAllowed'])
  })

  it('clears an expired session but stays put on a route that needs no login', async () => {
    const { run, invalidate } = setup({ expiry: 'expired', allowed: true })

    expect(await run('/about')).toBe('continue')
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it('clears an expired session on the login path without redirecting (no loop)', async () => {
    const { run, invalidate, isAllowed } = setup({ expiry: 'expired', allowed: false, loginPath: '/login' })

    expect(await run('/login')).toBe('continue')
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(isAllowed).not.toHaveBeenCalled()
  })

  it('compares the path exactly, so a nested login-looking route is still guarded', async () => {
    const { run } = setup({ expiry: 'expired', allowed: false, loginPath: '/login' })

    expect(await run('/login/help')).toBe('redirect')
  })

  it('does not redirect when the invalidation itself fails', async () => {
    const { run, invalidate } = setup({ expiry: 'expired', allowed: false })
    invalidate.mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(run('/secured')).resolves.toBe('continue')
  })
})
