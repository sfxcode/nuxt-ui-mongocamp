import { describe, it, expect, afterEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp, UChart } from '#components'
import MongocampChart from '../../src/runtime/components/MongocampChart.vue'

enableAutoUnmount(afterEach)

async function mountChart(props: Record<string, unknown> = {}) {
  const base = { data: [{ name: 'a', value: 1200 }, { name: 'b', value: 30 }], index: 'name', categories: [{ key: 'value', label: 'Size' }], chartLabel: 'Sizes' }
  const component = await mountSuspended(defineComponent({ setup: () => () => h(UApp, () => h(MongocampChart, { ...base, ...props })) }), { route: '/' })
  await new Promise(resolve => setTimeout(resolve, 50))
  return component
}

type ChartProps = { type: string, colors: string[], ui: unknown, ariaLabel: string, ariaDescription: string, legend: boolean, height: number, points: boolean }
const chartProps = (c: Awaited<ReturnType<typeof mountChart>>) => c.findComponent(UChart).props() as unknown as ChartProps

describe('MongocampChart', () => {
  it('draws a UChart with its label and description', async () => {
    const c = await mountChart({ chartDescription: '2 bars; the biggest is a.' })
    expect(chartProps(c)).toMatchObject({ type: 'bar', ariaLabel: 'Sizes', ariaDescription: '2 bars; the biggest is a.', height: 260, points: false })
  })

  it('always has six series colours taken from the theme', async () => {
    const { colors } = chartProps(await mountChart())
    expect(colors).toEqual([1, 2, 3, 4, 5, 6].map(i => `var(--ui-chart-${i})`))
  })

  it('needs no visibility override (unocss-nuxt-ui >= 1.3.0 generates the in-data-* variant)', async () => {
    expect(chartProps(await mountChart()).ui).toBeUndefined()
  })

  it('offers the same numbers as a table, formatted like the chart', async () => {
    const c = await mountChart({ format: (v: number) => `${v} B`, indexLabel: 'Collection' })
    const table = c.find('[data-test="chart-table"]')
    expect(table.findAll('th').map(th => th.text())).toEqual(['Collection', 'Size'])
    expect(table.findAll('tbody tr').map(tr => tr.text())).toEqual(['a1200 B', 'b30 B'])
  })

  it('can leave the table out where a list already shows the numbers', async () => {
    expect((await mountChart({ showTable: false })).find('[data-test="chart-table"]').exists()).toBe(false)
  })

  it('shows a legend for a donut or several series, not for one', async () => {
    expect(chartProps(await mountChart()).legend).toBe(false)
    expect(chartProps(await mountChart({ type: 'donut' })).legend).toBe(true)
    expect(chartProps(await mountChart({ categories: [{ key: 'value', label: 'Size' }, { key: 'other', label: 'Other' }] })).legend).toBe(true)
    expect(chartProps(await mountChart({ type: 'donut', legend: false })).legend).toBe(false)
  })

  it('a donut tables only its first series', async () => {
    const c = await mountChart({ type: 'donut', categories: [{ key: 'value', label: 'Size' }, { key: 'other', label: 'Other' }] })
    expect(c.find('[data-test="chart-table"]').findAll('th').map(th => th.text())).toEqual(['Value', 'Size'])
  })

  it('shows the empty text instead of a chart without data, and nothing when there is no text', async () => {
    const c = await mountChart({ data: [], emptyText: 'Nothing here' })
    expect(c.find('[data-test="chart-empty-text"]').text()).toBe('Nothing here')
    expect(c.findComponent(UChart).exists()).toBe(false)
    expect((await mountChart({ data: [] })).findComponent(UChart).exists()).toBe(false)
  })

  it('does not fetch the chart library until the chart is on screen', async () => {
    let report: ((entries: { isIntersecting: boolean }[]) => void) | undefined
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: typeof report) {
        report = callback
      }

      observe() {}
      disconnect() {}
    })
    try {
      const c = await mountChart()
      expect(c.findComponent(UChart).exists()).toBe(false)
      expect(c.find('[data-test="chart-table"]').exists()).toBe(true) // the numbers are there regardless

      report!([{ isIntersecting: true }])
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(c.findComponent(UChart).exists()).toBe(true)
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('cuts long axis labels but keeps the full names in the data table, and never merges two names into one', async () => {
    const long = 'test_order_backup_20261104_183304'
    const c = await mountChart({ data: [{ name: long, value: 5 }, { name: 'short', value: 3 }] })
    expect((c.findComponent(UChart).props() as { data: { name: string }[] }).data.map(d => d.name)).toEqual(['test_order_backup…', 'short'])
    expect(c.find('[data-test="chart-table"]').text()).toContain(long)

    const same = await mountChart({ data: [{ name: `${'x'.repeat(30)}a`, value: 1 }, { name: `${'x'.repeat(30)}b`, value: 2 }] })
    expect((same.findComponent(UChart).props() as { data: { name: string }[] }).data.map(d => d.name)).toEqual([`${'x'.repeat(30)}a`, `${'x'.repeat(30)}b`])
  })
})
