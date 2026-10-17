import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { UApp } from '#components'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampJobs from '../../src/runtime/components/MongocampJobs.vue'

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

    it('deletes the job by group and name after confirming, then reloads', async () => {
      await openDelete()
      expect(mockDeleteJob).not.toHaveBeenCalled()

      await confirm()?.trigger('click')
      await flushPromises()

      expect(mockDeleteJob).toHaveBeenCalledWith('Maintenance', 'CleanUp')
      expect(mockListJobs).toHaveBeenCalledTimes(2)
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
})
