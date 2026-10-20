import { describe, it, expect } from 'vitest'
import { isSuggestable, suggestionOptions, wantsSuggestions } from '../src/runtime/utils/filterSuggestions'

describe('wantsSuggestions', () => {
  it('is true only for exact-match operators on text fields', () => {
    for (const operator of ['equals', 'notEquals', 'oneOf'] as const) expect(wantsSuggestions('string', operator)).toBe(true)
    for (const operator of ['contains', 'startsWith', 'endsWith', 'isEmpty', 'isNotEmpty'] as const) expect(wantsSuggestions('string', operator)).toBe(false)
  })

  it('is false for every other field type, whatever the operator', () => {
    for (const type of ['number', 'date-time', 'boolean', 'array', 'object'] as const) {
      expect(wantsSuggestions(type, 'equals')).toBe(false)
      expect(wantsSuggestions(type, 'oneOf')).toBe(false)
    }
  })
})

describe('suggestionOptions', () => {
  it('offers each distinct value once, unchanged, for a single value', () => {
    expect(suggestionOptions(['A', 'B', 'A'], 'equals', 'x')).toEqual([{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }])
    expect(suggestionOptions(['A'], 'notEquals', '')).toEqual([{ value: 'A', label: 'A' }])
  })

  it('for a list, prefixes the entries already typed and does not offer them again', () => {
    expect(suggestionOptions(['A', 'B', 'C'], 'oneOf', 'A, ')).toEqual([
      { value: 'A, B', label: 'B' },
      { value: 'A, C', label: 'C' },
    ])
    expect(suggestionOptions(['A', 'B', 'C'], 'oneOf', 'A,B,')).toEqual([{ value: 'A, B, C', label: 'C' }])
  })

  it('for a list with nothing finished yet, offers the plain values', () => {
    expect(suggestionOptions(['A', 'B'], 'oneOf', '')).toEqual([{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }])
    expect(suggestionOptions(['A', 'B'], 'oneOf', 'par')).toEqual([{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }])
  })

  it('handles an empty value list and values containing commas or spaces', () => {
    expect(suggestionOptions([], 'equals', '')).toEqual([])
    expect(suggestionOptions(['New York'], 'oneOf', 'Paris, ')).toEqual([{ value: 'Paris, New York', label: 'New York' }])
  })
})

describe('isSuggestable', () => {
  it('accepts ordinary values, including spaces, umlauts, apostrophes, hyphens and quotes', () => {
    for (const value of ['Paris', 'New York', 'O\'Brien', 'Köln', 'under_score', 'in-progress', 'say "hi"', 'plus+sign', 'A&B', '2024']) {
      expect(isSuggestable(value, 'equals')).toBe(true)
    }
  })

  it('refuses values with characters the server treats as query syntax even when quoted and escaped', () => {
    for (const value of ['x:y', 'star*', 'x?y', '(paren)', 'a\\b', 'has)']) expect(isSuggestable(value, 'equals')).toBe(false)
  })

  it('refuses empty and blank values', () => {
    expect(isSuggestable('', 'equals')).toBe(false)
    expect(isSuggestable('  ', 'notEquals')).toBe(false)
  })

  it('refuses a comma only in a list, where it would split the value in two', () => {
    expect(isSuggestable('Doe, John', 'equals')).toBe(true)
    expect(isSuggestable('Doe, John', 'oneOf')).toBe(false)
  })
})

describe('suggestionOptions drops what cannot be filtered on', () => {
  it('leaves unfilterable values out of both single and list suggestions', () => {
    const values = ['Paris', 'x:y', 'star*', 'Doe, John', 'Bob']
    expect(suggestionOptions(values, 'equals', '').map(o => o.label)).toEqual(['Paris', 'Doe, John', 'Bob'])
    expect(suggestionOptions(values, 'oneOf', 'Paris, ').map(o => o.label)).toEqual(['Bob'])
  })
})
