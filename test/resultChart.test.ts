import { describe, it, expect } from 'vitest'
import { shortenLabel, topNWithOther } from '../src/runtime/utils/chartData'
import { buildResultChart, defaultKind, labelText, LABEL_KEY, MAX_CHART_ROWS, valueColumns } from '../src/runtime/utils/resultChart'

describe('chartData', () => {
  it('shortens long labels only', () => {
    expect(shortenLabel('short')).toBe('short')
    expect(shortenLabel('a'.repeat(30), 10)).toBe(`${'a'.repeat(9)}…`)
  })
  it('keeps the biggest n and sums the rest into other', () => {
    const items = [1, 5, 3, 2].map((value, i) => ({ label: `l${i}`, value }))
    expect(topNWithOther(items, 2, 'other')).toEqual([{ label: 'l1', value: 5 }, { label: 'l2', value: 3 }, { label: 'other', value: 3 }])
    expect(topNWithOther(items, 4, 'other')).toHaveLength(4)
    expect(topNWithOther([], 2, 'other')).toEqual([])
  })
})

describe('labelText', () => {
  it('writes ranges, compound ids and nulls readably', () => {
    expect(labelText({ min: 0, max: 10 })).toBe('0–10')
    expect(labelText({ a: 1, b: 'x' })).toBe('a=1, b=x')
    expect(labelText(null)).toBe('(none)')
    expect(labelText(5)).toBe('5')
  })
})

describe('defaultKind', () => {
  it('chooses donut, area or bar', () => {
    expect(defaultKind(['a', 'b', 'c'], 1, true)).toBe('donut')
    expect(defaultKind(['a', 'b', 'c'], 2, true)).toBe('bar')
    expect(defaultKind(['a', 'b', 'c'], 1, false)).toBe('bar')
    expect(defaultKind(['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07'], 1, true)).toBe('area')
    expect(defaultKind(['only'], 1, true)).toBe('bar')
  })
})

describe('buildResultChart', () => {
  const rows = [{ _id: 'a', count: 3, avg: 1.5 }, { _id: 'b', count: 5, avg: 2 }, { _id: 'c', count: 1, avg: 0.5 }]
  const columns = ['_id', 'count', 'avg']

  it('labels by _id and draws every numeric column', () => {
    const chart = buildResultChart(rows, columns)!
    expect(chart.labelKey).toBe('_id')
    expect(chart.valueKeys).toEqual(['count', 'avg'])
    expect(chart.kind).toBe('bar')
    expect(chart.data[0]).toEqual({ [LABEL_KEY]: 'a', count: 3, avg: 1.5 })
  })

  it('honours a chosen label, values and kind, ignoring unknown columns', () => {
    const chart = buildResultChart(rows, columns, { valueKeys: ['avg', 'nope'], kind: 'donut' })!
    expect(chart.valueKeys).toEqual(['avg'])
    expect(chart.kind).toBe('donut')
  })

  it('is a donut for a few non-negative slices of one value', () => {
    expect(buildResultChart(rows, columns, { valueKeys: ['count'] })!.kind).toBe('donut')
  })

  it('flattens bucketAuto ranges and compound ids', () => {
    const chart = buildResultChart([{ _id: { min: 0, max: 5 }, count: 2 }, { _id: { min: 5, max: 9 }, count: 4 }], ['_id', 'count'])!
    expect(chart.data.map(d => d[LABEL_KEY])).toEqual(['0–5', '5–9'])
  })

  it('leaves out rows without a number and counts them', () => {
    const chart = buildResultChart([{ _id: 'a', n: 1 }, { _id: 'b', n: 'x' }, { _id: 'c', n: 2 }], ['_id', 'n'])!
    expect(chart.data).toHaveLength(2)
    expect(chart.skipped).toBe(1)
  })

  it('caps the rows and says so', () => {
    const many = Array.from({ length: MAX_CHART_ROWS + 20 }, (_, i) => ({ _id: `k${i}`, n: i }))
    const chart = buildResultChart(many, ['_id', 'n'])!
    expect(chart.data).toHaveLength(MAX_CHART_ROWS)
    expect(chart.cut).toBe(true)
  })

  it('returns null without rows or a numeric column', () => {
    expect(buildResultChart([], ['_id'])).toBeNull()
    expect(buildResultChart([{ _id: 'a', t: 'x' }], ['_id', 't'])).toBeNull()
  })

  it('valueColumns skips the label column', () => {
    expect(valueColumns(rows, columns, 'count')).toEqual(['avg'])
  })
})
