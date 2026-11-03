import { describe, it, expect, vi } from 'vitest'
import { createVerifyCache, runSessionGuard } from '../src/runtime/utils/sessionGuard'
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

describe('runSessionGuard with a server check', () => {
  function withVerify(verify: () => Promise<'valid' | 'invalid' | 'unknown'>, options: { expiry?: TokenExpiryState, allowed?: boolean } = {}) {
    const invalidate = vi.fn(async () => {})
    const run = (path: string) => runSessionGuard({
      path,
      loginPath: '/login',
      checkExpiry: () => options.expiry ?? 'valid',
      invalidate,
      isAllowed: () => options.allowed ?? true,
      verify,
    })
    return { run, invalidate }
  }

  it('clears a locally valid token the server rejects, and redirects when the route needs a login', async () => {
    const { run, invalidate } = withVerify(async () => 'invalid', { allowed: false })

    expect(await run('/secured')).toBe('redirect')
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it('keeps a public page where it is after clearing', async () => {
    const { run, invalidate } = withVerify(async () => 'invalid', { allowed: true })

    expect(await run('/public')).toBe('continue')
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it.each(['valid', 'unknown'] as const)('does nothing when the server says %s', async (answer) => {
    const { run, invalidate } = withVerify(async () => answer)

    expect(await run('/secured')).toBe('continue')
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('does nothing when the check itself throws', async () => {
    const { run, invalidate } = withVerify(async () => {
      throw new Error('boom')
    })

    expect(await run('/secured')).toBe('continue')
    expect(invalidate).not.toHaveBeenCalled()
  })

  it.each(['unknown', 'expired'] as const)('does not ask the server for a %s token', async (expiry) => {
    const verify = vi.fn(async () => 'invalid' as const)
    const { run } = withVerify(verify, { expiry })

    await run('/secured')

    expect(verify).not.toHaveBeenCalled()
  })

  it('never redirects away from the login path', async () => {
    const { run, invalidate } = withVerify(async () => 'invalid', { allowed: false })

    expect(await run('/login')).toBe('continue')
    expect(invalidate).toHaveBeenCalledTimes(1)
  })
})

describe('createVerifyCache', () => {
  it('skips the check for the same token within the ttl, and only after a valid answer', async () => {
    let now = 1000
    const cached = createVerifyCache(30_000, () => now)
    const run = vi.fn(async () => 'valid' as const)

    expect(await cached('t1', run)).toBe('valid')
    now += 10_000
    expect(await cached('t1', run)).toBe('valid')
    expect(run).toHaveBeenCalledTimes(1)

    now += 25_000
    await cached('t1', run)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('checks a different token afresh, and never caches invalid or unknown', async () => {
    const cached = createVerifyCache(30_000, () => 0)
    const answers: Array<'valid' | 'invalid' | 'unknown'> = ['valid', 'invalid', 'invalid', 'unknown', 'unknown']
    const run = vi.fn(async () => answers.shift()!)

    await cached('t1', run)
    await cached('t2', run) // a different token: asked afresh
    await cached('t2', run) // invalid was not cached: asked again
    await cached('t3', run)
    await cached('t3', run) // unknown was not cached either

    expect(run).toHaveBeenCalledTimes(5)
  })
})
