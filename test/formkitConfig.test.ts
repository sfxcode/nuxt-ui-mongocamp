import { describe, it, expect } from 'vitest'
import { defaultFormkitConfigFile } from '../src/formkitConfig'

const DEFAULT = '/module/runtime/formkit.config'

describe('defaultFormkitConfigFile', () => {
  it('uses the module\'s config when the app has none', () => {
    expect(defaultFormkitConfigFile('/app', undefined, DEFAULT, () => false)).toBe(DEFAULT)
  })

  it.each(['ts', 'mjs', 'js'])('leaves an app\'s own formkit.config.%s alone', (extension) => {
    const exists = (path: string) => path === `/app/formkit.config.${extension}`
    expect(defaultFormkitConfigFile('/app', undefined, DEFAULT, exists)).toBeUndefined()
  })

  it('leaves a configured formkit.configFile alone, whether or not the file exists', () => {
    expect(defaultFormkitConfigFile('/app', './config/forms', DEFAULT, () => false)).toBeUndefined()
  })

  it('looks in the app\'s root directory only, with or without a trailing slash', () => {
    const seen: string[] = []
    defaultFormkitConfigFile('/app/', undefined, DEFAULT, (path) => {
      seen.push(path)
      return false
    })
    expect(seen).toEqual(['/app/formkit.config.ts', '/app/formkit.config.mjs', '/app/formkit.config.js'])
  })
})
