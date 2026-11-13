import { describe, expect, it } from 'vitest'
import { outcomeOfError, serverHealth } from '../src/runtime/utils/serverStatus'

const base = { info: 'ok', stats: 'ok', hasConnections: true, versionKnown: true } as const

describe('serverHealth', () => {
  it('is ok when everything asked answered', () => {
    expect(serverHealth(base)).toBe('ok')
  })

  it('is ok for a user who is not asked for the load', () => {
    expect(serverHealth({ ...base, stats: 'skipped', hasConnections: false })).toBe('ok')
  })

  it('is partial when the load came without connection numbers', () => {
    expect(serverHealth({ ...base, hasConnections: false })).toBe('partial')
  })

  it('is partial when one of two requests failed', () => {
    expect(serverHealth({ ...base, stats: 'failed', hasConnections: false })).toBe('partial')
    expect(serverHealth({ ...base, info: 'failed' })).toBe('partial')
  })

  it('is down when everything asked failed', () => {
    expect(serverHealth({ ...base, info: 'failed', stats: 'failed', hasConnections: false })).toBe('down')
    expect(serverHealth({ ...base, info: 'failed', stats: 'skipped', hasConnections: false })).toBe('down')
  })

  it('is partial, not down, when the server answers with an error — it is there', () => {
    expect(serverHealth({ ...base, info: 'refused', stats: 'refused', hasConnections: false })).toBe('partial')
    expect(serverHealth({ ...base, info: 'refused', stats: 'skipped', hasConnections: false })).toBe('partial')
    expect(serverHealth({ ...base, info: 'refused', stats: 'failed', hasConnections: false })).toBe('partial')
  })

  it('without anything to ask it goes by the version the plugin fetched', () => {
    expect(serverHealth({ info: 'skipped', stats: 'skipped', hasConnections: false, versionKnown: true })).toBe('ok')
    expect(serverHealth({ info: 'skipped', stats: 'skipped', hasConnections: false, versionKnown: false })).toBe('down')
  })
})

describe('outcomeOfError', () => {
  it('an error with an HTTP response is a refusal', () => {
    expect(outcomeOfError({ response: { status: 404 } })).toBe('refused')
    expect(outcomeOfError(Object.assign(new Error('x'), { response: { status: 403 } }))).toBe('refused')
  })

  it('anything else is a failure', () => {
    expect(outcomeOfError(new Error('network'))).toBe('failed')
    expect(outcomeOfError(null)).toBe('failed')
    expect(outcomeOfError({ response: {} })).toBe('failed')
  })
})
