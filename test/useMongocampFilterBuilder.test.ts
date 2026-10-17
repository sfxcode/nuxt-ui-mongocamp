import { describe, it, expect } from 'vitest'
import {
  buildCondition,
  buildFilterQuery,
  conditionValueText,
  countActiveConditions,
  FILTER_OPERATORS_BY_TYPE,
  operatorLabelKey,
  operatorsFor,
  toFilterFieldType,
  valueCountFor,
} from '../src/runtime/composables/useMongocampFilterBuilder'
import type { FilterCondition, FilterFieldType, FilterGroup, FilterOperator } from '../src/runtime/composables/useMongocampFilterBuilder'

function row(operator: FilterOperator, value?: string, value2?: string, field = 'name'): FilterCondition {
  return { id: `${field}-${operator}`, field, operator, value, value2 }
}

describe('operator tables', () => {
  it('offers each field type its own operators', () => {
    expect(operatorsFor('string')).toContain('contains')
    expect(operatorsFor('number')).toContain('between')
    expect(operatorsFor('number')).not.toContain('contains')
    expect(operatorsFor('date-time')).toEqual(['gte', 'lte', 'between'])
    expect(operatorsFor('boolean')).toEqual(['isTrue', 'isFalse'])
    expect(operatorsFor('array')).toEqual([])
    expect(operatorsFor('object')).toEqual([])
  })

  it('falls back to the string operators for an unknown type', () => {
    expect(operatorsFor('mystery' as FilterFieldType)).toEqual(FILTER_OPERATORS_BY_TYPE.string)
    expect(operatorsFor('constructor' as FilterFieldType)).toEqual(FILTER_OPERATORS_BY_TYPE.string)
  })

  it('says how many value inputs an operator needs', () => {
    expect(valueCountFor('contains')).toBe(1)
    expect(valueCountFor('oneOf')).toBe(1)
    expect(valueCountFor('between')).toBe(2)
    for (const operator of ['isTrue', 'isFalse', 'isEmpty', 'isNotEmpty'] as const) expect(valueCountFor(operator)).toBe(0)
  })
})

describe('buildCondition: strings', () => {
  it.each([
    ['contains', 'name:*ali*'],
    ['equals', 'name:"ali"'],
    ['notEquals', '-name:"ali"'],
    ['startsWith', 'name:ali*'],
    ['endsWith', 'name:*ali'],
  ] as const)('%s', (operator, expected) => {
    expect(buildCondition(row(operator, 'ali'), 'string')).toBe(expected)
  })

  it('oneOf splits on commas, trims, and drops empty entries', () => {
    expect(buildCondition(row('oneOf', ' a ,b,, '), 'string')).toBe('name:("a" OR "b")')
    expect(buildCondition(row('oneOf', 'a'), 'string')).toBe('name:"a"')
  })

  it('treats a row with no value as incomplete instead of matching everything', () => {
    for (const operator of ['contains', 'equals', 'notEquals', 'startsWith', 'endsWith', 'oneOf'] as const) {
      expect(buildCondition(row(operator, '   '), 'string')).toBe('')
      expect(buildCondition(row(operator), 'string')).toBe('')
    }
  })

  it('keeps * and ? working as wildcards in "contains" (documented behaviour)', () => {
    expect(buildCondition(row('contains', 'a*b'), 'string')).toBe('name:*a*b*')
  })
})

describe('buildCondition: numbers', () => {
  const age = (operator: FilterOperator, value?: string, value2?: string) => row(operator, value, value2, 'age')

  it('writes numbers unquoted so Lucene treats them as numeric', () => {
    expect(buildCondition(age('equals', '30'), 'number')).toBe('age:30')
    expect(buildCondition(age('notEquals', '30'), 'number')).toBe('-age:30')
    expect(buildCondition(age('equals', '-5'), 'number')).toBe('age:-5')
    expect(buildCondition(age('equals', '2.5'), 'number')).toBe('age:2.5')
    expect(buildCondition(age('oneOf', '1, 2'), 'number')).toBe('age:(1 OR 2)')
  })

  it('keeps the digits as typed, so numbers beyond 2^53 are not rounded to a different value', () => {
    expect(buildCondition(age('equals', '19185237114620650'), 'number')).toBe('age:19185237114620650')
    expect(buildCondition(age('gte', '19185237114620650'), 'number')).toBe('age:[19185237114620650 TO 9223372036854775807]')
    expect(buildCondition(age('oneOf', '19185237114620650, 1'), 'number')).toBe('age:(19185237114620650 OR 1)')
    expect(buildCondition(age('equals', ' 007 '), 'number')).toBe('age:007') // surrounding whitespace is trimmed, nothing else
    expect(buildCondition(age('equals', '.5'), 'number')).toBe('age:.5')
  })

  it('builds inclusive ranges, closing "at least"/"at most" with far bounds because a real server rejects `[x TO *]`', () => {
    expect(buildCondition(age('gte', '5'), 'number')).toBe('age:[5 TO 9223372036854775807]')
    expect(buildCondition(age('lte', '5'), 'number')).toBe('age:[-9223372036854775808 TO 5]')
    expect(buildCondition(age('between', '1', '5'), 'number')).toBe('age:[1 TO 5]')
    expect(buildCondition(age('gte', '5'), 'number')).not.toContain('*')
  })

  it('ignores rows whose numbers are missing or not numbers', () => {
    expect(buildCondition(age('equals', 'abc'), 'number')).toBe('')
    expect(buildCondition(age('equals', ''), 'number')).toBe('')
    expect(buildCondition(age('equals', 'Infinity'), 'number')).toBe('')
    expect(buildCondition(age('equals', '1e3'), 'number')).toBe('')
    expect(buildCondition(age('equals', '1,5'), 'number')).toBe('')
    expect(buildCondition(age('between', '1'), 'number')).toBe('')
    expect(buildCondition(age('between', '', '5'), 'number')).toBe('')
  })

  it('rejects a whole oneOf list if any entry is not a number, rather than silently dropping it', () => {
    expect(buildCondition(age('oneOf', '1, x, 3'), 'number')).toBe('')
  })
})

describe('buildCondition: dates', () => {
  const created = (operator: FilterOperator, value?: string, value2?: string) => row(operator, value, value2, 'created')

  it('widens a bare date to the whole day in UTC, so "on or before" includes that day', () => {
    expect(buildCondition(created('gte', '2024-01-01'), 'date-time')).toBe('created:[2024-01-01T00:00:00Z TO 9999-12-31T23:59:59.999Z]')
    expect(buildCondition(created('lte', '2024-01-01'), 'date-time')).toBe('created:[0001-01-01T00:00:00Z TO 2024-01-01T23:59:59.999Z]')
    expect(buildCondition(created('between', '2024-01-01', '2024-01-31'), 'date-time'))
      .toBe('created:[2024-01-01T00:00:00Z TO 2024-01-31T23:59:59.999Z]')
  })

  it('leaves a full timestamp exactly as given', () => {
    expect(buildCondition(created('between', '2024-01-01T10:00:00Z', '2024-02-01T12:30:00Z'), 'date-time'))
      .toBe('created:[2024-01-01T10:00:00Z TO 2024-02-01T12:30:00Z]')
  })

  it('ignores values that are not valid ISO dates', () => {
    expect(buildCondition(created('gte', 'yesterday'), 'date-time')).toBe('')
    expect(buildCondition(created('gte', '2024-13-45'), 'date-time')).toBe('')
    expect(buildCondition(created('between', '2024-01-01', 'soon'), 'date-time')).toBe('')
  })
})

describe('buildCondition: booleans and existence', () => {
  it('writes boolean tests without needing a value', () => {
    expect(buildCondition(row('isTrue', undefined, undefined, 'active'), 'boolean')).toBe('active:true')
    expect(buildCondition(row('isFalse', undefined, undefined, 'active'), 'boolean')).toBe('active:false')
  })

  it('writes "has a value" / "has no value" as a wildcard term, for text fields', () => {
    expect(buildCondition(row('isNotEmpty'), 'string')).toBe('name:*')
    expect(buildCondition(row('isEmpty'), 'string')).toBe('-name:*')
  })

  it('does not offer existence tests for other types, where a real server returned wrong results', () => {
    for (const type of ['number', 'date-time', 'boolean', 'array', 'object'] as const) {
      expect(operatorsFor(type)).not.toContain('isEmpty')
      expect(operatorsFor(type)).not.toContain('isNotEmpty')
      expect(buildCondition(row('isNotEmpty'), type)).toBe('')
      expect(buildCondition(row('isEmpty'), type)).toBe('')
    }
  })
})

describe('buildCondition: validity and safety', () => {
  it('ignores an operator that does not belong to the field type', () => {
    expect(buildCondition(row('contains', 'x'), 'number')).toBe('')
    expect(buildCondition(row('isTrue'), 'string')).toBe('')
    expect(buildCondition(row('between', '1', '2'), 'boolean')).toBe('')
  })

  it('ignores a row with no field chosen', () => {
    expect(buildCondition(row('equals', 'x', undefined, ''), 'string')).toBe('')
  })

  it('escapes special characters in field names, including for exists', () => {
    expect(buildCondition(row('equals', 'x', undefined, 'first name'), 'string')).toBe('first\\ name:"x"')
    expect(buildCondition(row('isNotEmpty', undefined, undefined, 'first name'), 'string')).toBe('first\\ name:*')
  })

  it('cannot be tricked into extra query syntax through a value', () => {
    // quote, space, colon and * are all backslash-escaped, so the whole input stays one term
    expect(buildCondition(row('equals', 'a" OR x:*'), 'string')).toBe('name:"a\\"\\ OR\\ x\\:\\*"')
  })

  it('cannot smuggle syntax through a range bound, which the query helper copies verbatim', () => {
    expect(buildCondition(row('gte', '5] OR x:[1', undefined, 'age'), 'number')).toBe('')
    expect(buildCondition(row('between', '1', '5] OR x:[1', 'age'), 'number')).toBe('')
    expect(buildCondition(row('gte', '2024-01-01] OR x:[1', undefined, 'created'), 'date-time')).toBe('')
  })
})

describe('buildFilterQuery / countActiveConditions', () => {
  const types: Record<string, FilterFieldType> = { name: 'string', age: 'number' }
  const group = (match: 'all' | 'any', ...conditions: FilterCondition[]): FilterGroup => ({ match, conditions })

  it('joins valid rows with AND for "all" and OR for "any"', () => {
    const rows = [row('contains', 'a'), row('equals', '30', undefined, 'age')]
    expect(buildFilterQuery(group('all', ...rows), types)).toBe('(name:*a* AND age:30)')
    expect(buildFilterQuery(group('any', ...rows), types)).toBe('(name:*a* OR age:30)')
  })

  it('wraps negated rows in parentheses when combining them', () => {
    expect(buildFilterQuery(group('all', row('contains', 'a'), row('notEquals', 'b')), types)).toBe('(name:*a* AND (-name:"b"))')
  })

  it('skips incomplete rows, and returns "" when nothing is valid', () => {
    expect(buildFilterQuery(group('any', row('contains', 'a'), row('equals', '')), types)).toBe('name:*a*')
    expect(buildFilterQuery(group('all'), types)).toBe('')
    expect(buildFilterQuery(group('all', row('equals', '')), types)).toBe('')
  })

  it('looks each row\'s type up by field, defaulting to string for unknown fields', () => {
    // "age" is a number: 'contains' is invalid there, so the row is skipped; 'mystery' falls back to string
    const rows = [row('contains', '1', undefined, 'age'), row('contains', 'x', undefined, 'mystery')]
    expect(buildFilterQuery(group('all', ...rows), types)).toBe('mystery:*x*')
  })

  it('counts only the rows that contribute to the query', () => {
    const rows = [row('contains', 'a'), row('equals', ''), row('equals', '30', undefined, 'age'), row('equals', 'abc', undefined, 'age')]
    expect(countActiveConditions(group('all', ...rows), types)).toBe(2)
  })
})

describe('helpers for the UI', () => {
  it('maps inferred schema types onto filter types, defaulting to string', () => {
    expect(toFilterFieldType('number')).toBe('number')
    expect(toFilterFieldType('integer')).toBe('number')
    expect(toFilterFieldType('date-time')).toBe('date-time')
    expect(toFilterFieldType('boolean')).toBe('boolean')
    expect(toFilterFieldType('array')).toBe('array')
    expect(toFilterFieldType('unknown')).toBe('string')
    expect(toFilterFieldType('toString')).toBe('string') // not fooled by Object.prototype keys
  })

  it('uses date wording for range operators on dates only', () => {
    expect(operatorLabelKey('gte', 'date-time')).toBe('nuxtUiMongocamp.filterBuilder.operators.gteDate')
    expect(operatorLabelKey('between', 'date-time')).toBe('nuxtUiMongocamp.filterBuilder.operators.betweenDate')
    expect(operatorLabelKey('gte', 'number')).toBe('nuxtUiMongocamp.filterBuilder.operators.gte')
    expect(operatorLabelKey('isNotEmpty', 'string')).toBe('nuxtUiMongocamp.filterBuilder.operators.isNotEmpty')
  })

  it('summarises a row\'s value for a chip', () => {
    expect(conditionValueText(row('contains', ' ali '))).toBe('ali')
    expect(conditionValueText(row('between', '1', '5'))).toBe('1 – 5')
    expect(conditionValueText(row('isNotEmpty', 'ignored'))).toBe('')
  })
})
