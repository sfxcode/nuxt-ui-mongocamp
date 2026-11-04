import { describe, it, expect, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import MongocampAggregationChart from '../../src/runtime/components/MongocampAggregationChart.vue'
import MongocampChart from '../../src/runtime/components/MongocampChart.vue'

enableAutoUnmount(afterEach)

const rows = [{ _id: 'a', count: 3 }, { _id: 'b', count: 5 }, { _id: 'c', count: 1 }, { _id: 'd', count: 2 }, { _id: 'e', count: 2 }, { _id: 'f', count: 9 }, { _id: 'g', count: 4 }]

const mountChart = (rows: Record<string, unknown>[]) => mountSuspended(
  defineComponent({ setup: () => () => h(UApp, () => h(MongocampAggregationChart, { rows })) }),
  { route: '/' },
)

describe('MongocampAggregationChart', () => {
  it('hands the rows to the chart with the data table holding the same numbers', async () => {
    const c = await mountChart(rows)
    await flushPromises()
    const chart = c.findComponent(MongocampChart)
    expect(chart.exists()).toBe(true)
    expect(chart.props('type')).toBe('bar')
    expect(chart.props('data')).toHaveLength(7)
    expect(chart.props('chartLabel')).toBe('Chart of count by _id')
    const cells = c.findAll('[data-test="chart-table"] tbody tr').map(tr => tr.text())
    expect(cells[1]).toContain('b')
    expect(cells[1]).toContain('5')
  })

  it('says so when no column holds a number', async () => {
    const c = await mountChart([{ _id: 'a', t: 'x' }])
    expect(c.find('[data-testid="chart-nothing"]').exists()).toBe(true)
    expect(c.findComponent(MongocampChart).exists()).toBe(false)
  })

  it('notes rows left out', async () => {
    const c = await mountChart([...rows, { _id: 'x', count: 'many' }])
    expect(c.find('[data-testid="chart-note"]').text()).toContain('1 rows without a number')
  })
})
