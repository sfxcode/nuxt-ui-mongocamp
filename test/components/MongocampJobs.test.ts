import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { UApp } from '#components'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampJobs from '../../src/runtime/components/MongocampJobs.vue'

// these components are for administrators: the gate (useMongocampAdminGate) lets an admin profile through
mockNuxtImport('useMongocampStorage', () => () => ({ value: { profile: { user: 'admin@example.com', isAdmin: true, roles: [] } } }))

// see MongocampRoles.test.ts for why the UApp wrapper, the forced unmount and the body-level modal() are needed
enableAutoUnmount(afterEach)

function withUApp(component: unknown) {
  return defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs }) {
      return () => h(UApp, () => h(component as never, attrs))
    },
  })
}

function wait(ms = 50) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function modal() {
  return new DOMWrapper(document.body)
}

const mockListJobs = vi.fn()
const mockDeleteJob = vi.fn()

// useMongocampJobs is a genuine Nuxt auto-import here (imported from '#imports'), so mockNuxtImport applies
mockNuxtImport('useMongocampJobs', () => () => ({
  listJobs: mockListJobs,
  listPossibleJobs: vi.fn().mockResolvedValue([]),
  registerJob: vi.fn(),
  updateJob: vi.fn(),
  executeJob: vi.fn(),
  deleteJob: mockDeleteJob,
}))

const job = { name: 'CleanUp', group: 'Maintenance', className: 'x.CleanUp', description: '', cronExpression: '0 0 * * * ?', priority: 5 }
const fetchError = Object.assign(new Error('The request failed'), { name: 'FetchError' })

beforeEach(() => {
  vi.clearAllMocks()
  mockListJobs.mockResolvedValue([job])
  mockDeleteJob.mockResolvedValue(undefined)
})

describe('MongocampJobs', () => {
  it('hideRefresh removes the reload button; the toolbar slot and refresh() are there for the page', async () => {
    const exposed: { current: { refresh?: () => unknown } | null } = { current: null }
    const mountWith = (hideRefresh: boolean) => mountSuspended(defineComponent({
      setup: () => () => h(UApp, () => h(
        MongocampJobs,
        { hideRefresh, ref: (el: unknown) => { exposed.current = el as typeof exposed.current } },
        { toolbar: () => h('button', { 'data-test': 'page-button' }, 'Mine') },
      )),
    }), { route: '/' })

    const shown = await mountWith(false)
    await new Promise(resolve => setTimeout(resolve, 50))
    const reloadButtons = shown.findAll('button').filter(button => button.find('[class*="refresh-cw"]').exists()).length
    expect(reloadButtons).toBeGreaterThan(0)

    const hidden = await mountWith(true)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(hidden.findAll('button').filter(button => button.find('[class*="refresh-cw"]').exists())).toHaveLength(reloadButtons - 1)
    expect(hidden.find('[data-test="page-button"]').exists()).toBe(true)
    expect(typeof exposed.current?.refresh).toBe('function')
  })

  it('hideHeading removes the heading and keeps the toolbar', async () => {
    const shown = await mountSuspended(withUApp(MongocampJobs), { route: '/' })
    expect(shown.find('h2').exists()).toBe(true)

    const hidden = await mountSuspended(withUApp(MongocampJobs), { route: '/', props: { hideHeading: true } })
    expect(hidden.find('h2').exists()).toBe(false)
    expect(hidden.find('button[aria-label="Refresh"]').exists()).toBe(true)
  })

  it('lists the jobs from the composable', async () => {
    const component = await mountSuspended(withUApp(MongocampJobs), { route: '/' })
    await flushPromises()

    expect(component.text()).toContain('CleanUp')
    expect(component.text()).toContain('Maintenance')
  })

  describe('single-row delete', () => {
    async function openDelete() {
      const component = await mountSuspended(withUApp(MongocampJobs), { route: '/' })
      await flushPromises()
      await component.find('[aria-label="Delete job"]').trigger('click')
      await wait()
      return component
    }

    const confirm = () => modal().findAll('button').find(b => b.text() === 'Delete')

    it('deletes the job by group and name after confirming, reloads, then emits changed', async () => {
      const component = await openDelete()
      expect(mockDeleteJob).not.toHaveBeenCalled()

      await confirm()?.trigger('click')
      await flushPromises()

      expect(mockDeleteJob).toHaveBeenCalledWith('Maintenance', 'CleanUp')
      expect(mockListJobs).toHaveBeenCalledTimes(2)
      expect(component.findComponent(MongocampJobs).emitted('changed')).toHaveLength(1)
    })

    it('keeps the dialog open and says why when the server refuses, instead of failing silently', async () => {
      await openDelete()
      mockDeleteJob.mockRejectedValueOnce(fetchError)

      await confirm()?.trigger('click')
      await flushPromises()

      expect(modal().text()).toContain('Delete Job')
      expect(modal().text()).toContain('could not be reached')
      expect(mockListJobs).toHaveBeenCalledTimes(1)
    })

    it('lets the user try again after a refusal', async () => {
      await openDelete()
      mockDeleteJob.mockRejectedValueOnce(fetchError)
      await confirm()?.trigger('click')
      await flushPromises()

      await confirm()?.trigger('click')
      await flushPromises()

      expect(mockDeleteJob).toHaveBeenCalledTimes(2)
      expect(mockListJobs).toHaveBeenCalledTimes(2)
      expect(modal().text()).not.toContain('could not be reached')
    })
  })

  describe('autoRefresh', () => {
    const waitMs = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    it('reloads the list every N seconds, only when asked to', async () => {
      const off = await mountSuspended(withUApp(MongocampJobs), { route: '/' })
      await flushPromises()
      await waitMs(1300)
      expect(mockListJobs).toHaveBeenCalledTimes(1)
      off.unmount()

      mockListJobs.mockClear()
      const on = await mountSuspended(withUApp(MongocampJobs), { route: '/', props: { autoRefresh: 1 } })
      await flushPromises()
      await waitMs(1300)
      expect(mockListJobs.mock.calls.length).toBeGreaterThanOrEqual(2)
      on.unmount()
    })

    it('keeps the list on screen when a background reload fails', async () => {
      const component = await mountSuspended(withUApp(MongocampJobs), { route: '/', props: { autoRefresh: 1 } })
      await flushPromises()
      mockListJobs.mockRejectedValue(fetchError)
      await waitMs(1300)
      await flushPromises()
      expect(component.text()).toContain('CleanUp')
    })
  })
})
