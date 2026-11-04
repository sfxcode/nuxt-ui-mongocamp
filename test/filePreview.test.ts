import { describe, it, expect } from 'vitest'
import { canPreview, clipText, parseMetadataJson, PREVIEW_LIMITS, prettyJson, previewKind } from '../src/runtime/utils/filePreview'

describe('previewKind', () => {
  it('goes by extension, case-insensitively', () => {
    expect(previewKind('Photo.PNG')).toBe('image')
    expect(previewKind('a.json')).toBe('json')
    expect(previewKind('a.csv')).toBe('csv')
    expect(previewKind('notes.md')).toBe('text')
    expect(previewKind('doc.pdf')).toBe('pdf')
    expect(previewKind('archive.zip')).toBe('other')
  })
  it('falls back to the blob type only without an extension', () => {
    expect(previewKind('blob', 'image/png')).toBe('image')
    expect(previewKind('blob', 'text/plain; charset=utf-8')).toBe('text')
    expect(previewKind('a.zip', 'image/png')).toBe('other')
  })
  it('never renders SVG inline', () => {
    expect(previewKind('logo.svg')).toBe('other')
    expect(previewKind('logo', 'image/svg+xml')).toBe('other')
  })
})

describe('canPreview', () => {
  it('respects the per-kind cap', () => {
    expect(canPreview('json', PREVIEW_LIMITS.json)).toBe(true)
    expect(canPreview('json', PREVIEW_LIMITS.json + 1)).toBe(false)
    expect(canPreview('other', 1)).toBe(false)
  })
})

describe('text helpers', () => {
  it('pretty-prints JSON and leaves other text alone', () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(prettyJson('{"a":1}\n{"b":2}')).toBe('{"a":1}\n{"b":2}')
  })
  it('clips long text', () => {
    expect(clipText('abcdef', 3)).toEqual({ text: 'abc', clipped: true })
    expect(clipText('abc', 3)).toEqual({ text: 'abc', clipped: false })
  })
})

describe('parseMetadataJson', () => {
  it('accepts an object and empty text', () => {
    expect(parseMetadataJson('{"a":1,"b":{"c":true}}')).toEqual({ ok: true, value: { a: 1, b: { c: true } } })
    expect(parseMetadataJson('  ')).toEqual({ ok: true, value: {} })
  })
  it('rejects invalid JSON, arrays and scalars', () => {
    expect(parseMetadataJson('{')).toEqual({ ok: false, reason: 'invalid-json' })
    expect(parseMetadataJson('[1]')).toEqual({ ok: false, reason: 'not-object' })
    expect(parseMetadataJson('null')).toEqual({ ok: false, reason: 'not-object' })
    expect(parseMetadataJson('"x"')).toEqual({ ok: false, reason: 'not-object' })
  })
})
