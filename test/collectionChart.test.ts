import { describe, expect, it } from 'vitest'
import { analyzeSamples } from '../src/runtime/utils/analyzeSamples'
import { chartKindFor, chartRequest, chartTypeFor, dominantKind, highestPoint, MAX_BAR_PERIODS, MAX_PERIODS, rowsToPoints } from '../src/runtime/utils/collectionChart'
import { buildPipeline, findForbidden } from '../src/runtime/utils/aggregationPipeline'

describe('chartKindFor / dominantKind', () => {
  it('maps value kinds to a chart, and nothing for objects, arrays and nulls', () => {
    expect(chartKindFor('string')).toBe('values')
    expect(chartKindFor('boolean')).toBe('values')
    expect(chartKindFor('date')).toBe('dates')
    expect(chartKindFor('number')).toBe('numbers')
    for (const kind of ['object', 'array', 'null', undefined] as const) expect(chartKindFor(kind)).toBeUndefined()
  })

  it('takes the most frequent kind of a field, ignoring null', () => {
    const analysis = analyzeSamples([
      { a: 'x', n: 1, when: '2026-01-02T03:04:05Z', mixed: 1, tags: ['a'] },
      { a: 'y', n: 2, when: '2026-01-03T03:04:05Z', mixed: 'x' },
      { a: null, n: null, mixed: 2 },
      { a: 'z', n: 3, mixed: 3 },
    ])
    expect(dominantKind(analysis, 'a')).toBe('string')
    expect(dominantKind(analysis, 'n')).toBe('number')
    expect(dominantKind(analysis, 'when')).toBe('date')
    expect(dominantKind(analysis, 'mixed')).toBe('number')
    expect(dominantKind(analysis, 'tags')).toBe('array')
    expect(dominantKind(analysis, 'nope')).toBeUndefined()
  })

  it('knows a nested field by its path', () => {
    expect(dominantKind(analyzeSamples([{ a: { b: 'x' } }]), 'a.b')).toBe('string')
  })
})

describe('chartRequest', () => {
  it('top values: group, sort by count then value, one page of N (the total is the number of distinct values)', () => {
    expect(chartRequest('values', 'cat')).toEqual({
      pipeline: [{ stage: '$group', value: { _id: '$cat', count: { $sum: 1 } } }, { stage: '$sort', value: { count: -1, _id: 1 } }],
      rowsPerPage: 10,
    })
    expect(chartRequest('values', 'cat', { top: 5 })!.rowsPerPage).toBe(5)
  })

  it('dates: only real dates, formatted per unit, oldest first, up to 100 periods', () => {
    const request = chartRequest('dates', 'when', { unit: 'year' })!
    expect(request.pipeline).toEqual([
      { stage: '$match', value: { when: { $type: 'date' } } },
      { stage: '$group', value: { _id: { $dateToString: { format: '%Y', date: '$when' } }, count: { $sum: 1 } } },
      { stage: '$sort', value: { _id: 1 } },
    ])
    expect(request.rowsPerPage).toBe(MAX_PERIODS)
    expect(JSON.stringify(chartRequest('dates', 'when')!.pipeline)).toContain('%Y-%m')
    expect(JSON.stringify(chartRequest('dates', 'when', { unit: 'day' })!.pipeline)).toContain('%Y-%m-%d')
  })

  it('numbers: only numbers, automatic buckets, one page of that many', () => {
    expect(chartRequest('numbers', 'price', { buckets: 6 })).toEqual({
      pipeline: [{ stage: '$match', value: { price: { $type: 'number' } } }, { stage: '$bucketAuto', value: { groupBy: '$price', buckets: 6 } }],
      rowsPerPage: 6,
    })
  })

  it('works for nested fields and refuses a name that cannot be written as $name', () => {
    expect(chartRequest('values', 'a.b')!.pipeline[0]!.value).toMatchObject({ _id: '$a.b' })
    for (const bad of ['', '$x', 'a..b', '.a', 'a\u0000b']) expect(chartRequest('values', bad)).toBeUndefined()
  })

  it('every request passes the builder\'s own deny-list', () => {
    for (const kind of ['values', 'dates', 'numbers'] as const) expect(findForbidden(buildPipeline(chartRequest(kind, 'f')!.pipeline.map((s, i) => ({ id: String(i), type: s.stage as never, value: s.value }))))).toEqual([])
  })
})

describe('rowsToPoints', () => {
  it('labels the groups of a values chart, naming the missing ones', () => {
    expect(rowsToPoints('values', [{ _id: 'a', count: 3 }, { _id: null, count: 2 }, { _id: 7, count: 1 }, { _id: true, count: 1 }], '(none)')).toEqual([
      { label: 'a', count: 3 }, { label: '(none)', count: 2 }, { label: '7', count: 1 }, { label: 'true', count: 1 },
    ])
  })

  it('uses the period text of a date histogram', () => {
    expect(rowsToPoints('dates', [{ _id: '2026-01', count: 4 }], '(none)')).toEqual([{ label: '2026-01', count: 4 }])
  })

  it('writes a number range as min–max, keeping every digit of a number beyond 2^53', () => {
    expect(rowsToPoints('numbers', [{ _id: { min: 1.5, max: 85.5 }, count: 59 }, { _id: { min: '9007199254740993', max: '9007199254741193' }, count: 2 }], '')).toEqual([
      { label: '1.5–85.5', count: 59 }, { label: '9007199254740993–9007199254741193', count: 2 },
    ])
  })

  it('does not break on a malformed row', () => {
    expect(rowsToPoints('numbers', [{ count: 'x' }], '')[0]).toEqual({ label: 'undefined–undefined', count: 0 })
    expect(rowsToPoints('values', [{ _id: { a: 1 }, count: 2 }], '(none)')[0]).toEqual({ label: '{"a":1}', count: 2 })
  })
})

describe('chart type and highest point', () => {
  it('bars up to 36 periods, an area chart beyond; always bars otherwise', () => {
    expect(chartTypeFor('dates', MAX_BAR_PERIODS)).toBe('bar')
    expect(chartTypeFor('dates', MAX_BAR_PERIODS + 1)).toBe('area')
    expect(chartTypeFor('values', 500)).toBe('bar')
    expect(chartTypeFor('numbers', 500)).toBe('bar')
  })

  it('finds the highest point, the first on a tie, and none when empty', () => {
    expect(highestPoint([{ label: 'a', count: 1 }, { label: 'b', count: 5 }, { label: 'c', count: 5 }])).toEqual({ label: 'b', count: 5 })
    expect(highestPoint([])).toBeUndefined()
  })
})
