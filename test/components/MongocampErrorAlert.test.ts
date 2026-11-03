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

  describe('what the server said ({ code, msg } body)', () => {
    const serverError = (status: number, body: unknown) => Object.assign(new Error('Response returned an error code'), {
      name: 'ResponseError',
      response: new Response(JSON.stringify(body), { status }),
    })

    it('shows the server\'s message for a failed request instead of the generic client text', async () => {
      const component = await mountAlert({ error: serverError(404, { code: -1, msg: 'could not find document' }) })

      expect(component.text()).toContain('could not find document')
      expect(component.text()).not.toContain('Response returned an error code')
      expect(button(component, 'Retry')).toBeDefined()
    })

    it('names a refused operator (403, code 4031) and does not call it a missing permission', async () => {
      const component = await mountAlert({ error: serverError(403, { code: 4031, msg: 'the operator $function is not allowed in an aggregation' }) })

      expect(component.text()).toContain('The server does not allow the operator $function.')
      expect(component.text()).not.toContain('do not have permission')
    })

    it('adds the server\'s reason to the "filter could not be applied" text', async () => {
      const component = await mountAlert({ error: serverError(400, { code: 4001, msg: 'the filter syntax is not supported' }), filterRejected: true })

      expect(component.text()).toContain('The filter could not be applied')
      expect(component.text()).toContain('Server message: the filter syntax is not supported')
    })

    it('never shows a database address', async () => {
      const component = await mountAlert({ error: serverError(500, { code: -1, msg: 'Timed out on server 10.0.0.5:27017. Giving up' }) })

      expect(component.text()).not.toMatch(/10\.0\.0\.5|27017/)
    })

    it('keeps the session message for a 401 even when the body says something else', async () => {
      const component = await mountAlert({ error: serverError(401, { code: 4011, msg: 'user not authorized' }) })

      expect(component.text()).toContain('Your session has expired')
      expect(button(component, 'Log in again')).toBeDefined()
    })

    it('follows a changed error prop', async () => {
      const component = await mountAlert({ error: serverError(404, { code: -1, msg: 'first message' }) })
      expect(component.text()).toContain('first message')

      await component.setProps({ error: serverError(404, { code: -1, msg: 'second message' }) })
      await flushPromises()

      expect(component.text()).toContain('second message')
      expect(component.text()).not.toContain('first message')
    })
  })
})
