import { describe, it, expect } from 'vitest'
import { buildConfigRows, isSecretConfigKey, MASKED_VALUE } from '../src/runtime/utils/configRows'

// shaped like the real MongoCamp 1.5.10 payload (checked live): Option[String] values arrive as `{ value }`,
// the generated client type claims `value: number`, lists are arrays, unset lists are null
const SECRET = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'
const real = [
  { key: 'AUTH_APIKEYLENGTH', value: 24, configType: 'Long', needsRestartForActivation: true, comment: 'length of generated api keys' },
  { key: 'AUTH_TOKEN', value: true, configType: 'Boolean', needsRestartForActivation: false, comment: 'enable token auth' },
  { key: 'AUTH_SECRET', value: SECRET, configType: 'String', needsRestartForActivation: true, comment: 'jwt secret' },
  { key: 'AUTH_ROLES', value: null, configType: 'List[String]', needsRestartForActivation: true, comment: '' },
  { key: 'CONNECTION_PASSWORD', value: { value: 'hunter2-db-password' }, configType: 'Option[String]', needsRestartForActivation: true, comment: '' },
  { key: 'CONNECTION_USERNAME', value: { value: 'mongo-admin' }, configType: 'Option[String]', needsRestartForActivation: true, comment: '' },
  { key: 'CONNECTION_HOST', value: '10.20.30.40', configType: 'String', needsRestartForActivation: true, comment: '' },
  { key: 'CORS_ORIGINS_ALLOWED', value: ['https://a.example', 'https://b.example'], configType: 'List[String]', needsRestartForActivation: false, comment: '' },
  { key: 'PLUGINS_URLS', value: [], configType: 'List[String]', needsRestartForActivation: true, comment: '' },
  { key: 'SERVER_PORT', value: 8080, configType: 'Long', needsRestartForActivation: true, comment: '' },
]

const byKey = (rows: ReturnType<typeof buildConfigRows>) => Object.fromEntries(rows.map(r => [r.key, r]))

describe('isSecretConfigKey', () => {
  it.each(['AUTH_SECRET', 'CONNECTION_PASSWORD', 'CONNECTION_USERNAME', 'CONNECTION_HOST', 'MY_API_KEY', 'SOME_TOKEN_VALUE', 'db.credentials', 'private_key'])('treats %s as secret', (key) => {
    expect(isSecretConfigKey(key)).toBe(true)
  })

  it.each(['AUTH_APIKEYLENGTH', 'SERVER_PORT', 'CORS_ORIGINS_ALLOWED', 'FILE_CACHE_AGE', 'DOCS_SWAGGER', 'AUTH_USERS', 'AUTH_ROLES'])('does not treat %s as secret', (key) => {
    // AUTH_APIKEYLENGTH is just a number, AUTH_USERS/AUTH_ROLES are lists of names
    expect(isSecretConfigKey(key)).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isSecretConfigKey('auth_secret')).toBe(true)
    expect(isSecretConfigKey('Connection_Password')).toBe(true)
  })
})

describe('buildConfigRows', () => {
  it('masks secret string and Option values, and never lets the original value into a row', () => {
    const rows = buildConfigRows(real)

    for (const key of ['AUTH_SECRET', 'CONNECTION_PASSWORD', 'CONNECTION_USERNAME', 'CONNECTION_HOST']) {
      expect(byKey(rows)[key]).toMatchObject({ value: MASKED_VALUE, masked: true })
    }
    const everything = JSON.stringify(rows)
    for (const leaked of [SECRET, 'hunter2-db-password', 'mongo-admin', '10.20.30.40']) {
      expect(everything).not.toContain(leaked)
    }
  })

  it('leaves a boolean or number alone even when its key looks secret (AUTH_TOKEN is just a switch)', () => {
    const rows = byKey(buildConfigRows(real))

    expect(rows.AUTH_TOKEN).toMatchObject({ value: 'true', masked: false })
    expect(rows.AUTH_APIKEYLENGTH).toMatchObject({ value: '24', masked: false })
  })

  it('shows ordinary values readably: numbers, lists, empty lists and null', () => {
    const rows = byKey(buildConfigRows(real))

    expect(rows.SERVER_PORT!.value).toBe('8080')
    expect(rows.CORS_ORIGINS_ALLOWED!.value).toBe('https://a.example, https://b.example')
    expect(rows.PLUGINS_URLS!.value).toBe('—')
    expect(rows.AUTH_ROLES!.value).toBe('—')
  })

  it('unwraps an Option value that is not secret', () => {
    const rows = buildConfigRows([{ key: 'FILE_HANDLER', value: { value: 'local' }, configType: 'Option[String]' }])

    expect(rows[0]!.value).toBe('local')
  })

  it('carries type, restart flag and comment along', () => {
    const row = byKey(buildConfigRows(real)).AUTH_APIKEYLENGTH!

    expect(row).toMatchObject({ key: 'AUTH_APIKEYLENGTH', configType: 'Long', needsRestart: true, comment: 'length of generated api keys' })
  })

  it('masks a secret list too (a list of credentials is still credentials)', () => {
    const rows = buildConfigRows([{ key: 'API_TOKENS', value: ['t1-secret', 't2-secret'], configType: 'List[String]' }])

    expect(rows[0]).toMatchObject({ value: MASKED_VALUE, masked: true })
    expect(JSON.stringify(rows)).not.toContain('t1-secret')
  })

  it('does not mask an unset secret — there is nothing to hide', () => {
    const rows = buildConfigRows([{ key: 'AUTH_SECRET', value: null }, { key: 'CONNECTION_PASSWORD', value: { value: '' } }])

    expect(rows.map(r => r.masked)).toEqual([false, false])
    expect(rows.map(r => r.value)).toEqual(['—', '—'])
  })

  it('serialises an unexpected object defensively instead of throwing', () => {
    const rows = buildConfigRows([{ key: 'ODD', value: { nested: { a: 1 } } }])

    expect(rows[0]!.value).toBe('{"nested":{"a":1}}')
  })

  it('survives garbage: non-array input, rows without a key, circular values', () => {
    expect(buildConfigRows(undefined)).toEqual([])
    expect(buildConfigRows(null)).toEqual([])
    expect(buildConfigRows('nope')).toEqual([])
    expect(buildConfigRows([null, 42, { value: 1 }, { key: 7 }, { key: '' }])).toEqual([])
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => buildConfigRows([{ key: 'LOOP', value: circular }])).not.toThrow()
  })

  it('sorts by key', () => {
    const rows = buildConfigRows([{ key: 'B', value: 1 }, { key: 'A', value: 2 }])

    expect(rows.map(r => r.key)).toEqual(['A', 'B'])
  })
})
