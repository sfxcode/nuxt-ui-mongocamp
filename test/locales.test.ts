import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Guards the translation files: a key a component asks for must exist (a missing key renders its own name), and English and
// German must hold the same keys. Keys built from a template string are checked by their prefix.
const ROOT = join(__dirname, '..')

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, inner]) => flatten(inner, prefix ? `${prefix}.${key}` : key))
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(?:vue|ts)$/.test(name) ? [path] : []
  })
}

const en = new Set(flatten(JSON.parse(readFileSync(join(ROOT, 'src/runtime/locales/en.json'), 'utf8'))))
const de = new Set(flatten(JSON.parse(readFileSync(join(ROOT, 'src/runtime/locales/de.json'), 'utf8'))))

const used = new Map<string, string[]>() // key (or prefix) -> files
const prefixes = new Map<string, string[]>()
for (const file of sourceFiles(join(ROOT, 'src/runtime'))) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(/['"`](nuxtUiMongocamp\.(?:[\w.-]|\$(?!\{))+)(\$\{)?/g)) {
    const [, key, template] = match
    const target = template ? prefixes : used
    target.set(key!, [...(target.get(key!) ?? []), file.replace(`${ROOT}/`, '')])
  }
}

describe('locales', () => {
  it('English and German hold the same keys', () => {
    expect([...en].filter(k => !de.has(k))).toEqual([])
    expect([...de].filter(k => !en.has(k))).toEqual([])
  })

  it('every key a source file asks for exists in both languages', () => {
    const missing = [...used.entries()]
      // an exact key, or the first part of a longer one that is built at runtime
      .filter(([key]) => !en.has(key) && ![...en].some(k => k.startsWith(`${key}.`)))
      .map(([key, files]) => `${key} (${files[0]})`)

    expect(missing).toEqual([])
  })

  it('every key built from a template string has keys under its prefix', () => {
    const empty = [...prefixes.entries()]
      .filter(([prefix]) => ![...en].some(k => k.startsWith(prefix)))
      .map(([prefix, files]) => `${prefix} (${files[0]})`)

    expect(empty).toEqual([])
  })
})
