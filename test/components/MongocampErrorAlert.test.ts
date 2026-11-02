import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampErrorAlert from '../../src/runtime/components/MongocampErrorAlert.vue'

const fetchError = Object.assign(new Error('The request failed'), { name: 'FetchError' })
const unauthorized = { name: 'ResponseError', response: { status: 401 } }

const order: string[] = []
const mockInvalidate = vi.fn()
const mockNavigate = vi.fn()

mockNuxtImport('useMongocampSession', () => () => ({ invalidateSession: mockInvalidate }))
mockNuxtImport('navigateTo', () => (to: string) => mockNavigate(to))

beforeEach(() => {
  vi.clearAllMocks()
  order.length = 0
  mockInvalidate.mockImplementation(async () => {
    order.push('invalidate')
  })
  mockNavigate.mockImplementation((to: string) => {
    order.push(`navigate:${to}`)
  })
})

async function mountAlert(props: { error: unknown, loginPath?: string, filterRejected?: boolean }) {
  const component = await mountSuspended(MongocampErrorAlert, { props, route: '/' })
  await flushPromises()
  return component
}

const button = (component: Awaited<ReturnType<typeof mountAlert>>, label: string) => component.findAll('button').find(b => b.text() === label)

describe('MongocampErrorAlert', () => {
  it('renders nothing when there is no error', async () => {
    const component = await mountAlert({ error: null })

    expect(component.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows a readable message instead of the raw FetchError text, and emits retry', async () => {
    const component = await mountAlert({ error: fetchError })

    expect(component.text()).toContain('could not be reached')
    expect(component.text()).not.toContain('The request failed')

    await button(component, 'Retry')?.trigger('click')
    expect(component.emitted('retry')).toHaveLength(1)
  })

  describe('"Log in again"', () => {
    it('clears the session first and only then navigates to loginPath', async () => {
      const component = await mountAlert({ error: unauthorized, loginPath: '/login' })

      await button(component, 'Log in again')!.trigger('click')
      await flushPromises()

      expect(order).toEqual(['invalidate', 'navigate:/login'])
    })

    it('does not navigate when clearing the session is still pending', async () => {
      let release!: () => void
      mockInvalidate.mockImplementation(() => new Promise<void>((r) => {
        release = r
      }))
      const component = await mountAlert({ error: unauthorized, loginPath: '/login' })

      await button(component, 'Log in again')!.trigger('click')
      await flushPromises()
      expect(mockNavigate).not.toHaveBeenCalled()

      release()
      await flushPromises()
      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })

    it('falls back to the module\'s loginPath option when no loginPath prop is given', async () => {
      const component = await mountAlert({ error: unauthorized })

      await button(component, 'Log in again')!.trigger('click')
      await flushPromises()

      expect(mockNavigate).toHaveBeenCalledWith('/')
    })

    it('a readable 401 offers the button', async () => {
      const component = await mountAlert({ error: unauthorized, loginPath: '/login' })

      expect(button(component, 'Retry')).toBeUndefined()
      await button(component, 'Log in again')!.trigger('click')
      await flushPromises()

      expect(order).toEqual(['invalidate', 'navigate:/login'])
    })
  })

  it('keeps Retry for a 403 or a plain error: they are not about the session', async () => {
    const forbidden = await mountAlert({ error: { name: 'ResponseError', response: { status: 403 } } })
    const plain = await mountAlert({ error: new Error('boom') })

    expect(button(forbidden, 'Retry')).toBeDefined()
    expect(button(plain, 'Retry')).toBeDefined()
    expect(button(plain, 'Log in again')).toBeUndefined()
  })

  it('says the filter was rejected, instead of blaming the network, and offers to clear it', async () => {
    const component = await mountAlert({ error: fetchError, filterRejected: true })

    expect(component.text()).toContain('The filter could not be applied')
    expect(component.text()).not.toContain('could not be reached')
    expect(button(component, 'Retry')).toBeUndefined()

    await button(component, 'Clear filters')?.trigger('click')
    expect(component.emitted('clearFilters')).toHaveLength(1)
  })
})
