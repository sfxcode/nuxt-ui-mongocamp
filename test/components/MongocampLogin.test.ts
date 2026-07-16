import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import type { DOMWrapper } from '@vue/test-utils'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import MongocampLogin from '../../src/runtime/components/MongocampLogin.vue'

// See test/components/MongocampRoles.test.ts for why each of these helpers is needed.
enableAutoUnmount(afterEach)

function wait(ms = 50) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function withUApp(component: unknown) {
  return defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs }) {
      return () => h(UApp, () => h(component as never, attrs))
    },
  })
}

function findInputByLabel(scope: DOMWrapper<Element>, labelText: string) {
  const label = scope.findAll('label').find(l => l.text() === labelText)
  const id = label?.attributes('for')
  if (!id) throw new Error(`No label found with text "${labelText}"`)
  return scope.find(`#${id}`)
}

const mockLogin = vi.fn()

// useMongocampAuth is a genuine Nuxt auto-import (from '#imports', re-exported by
// @sfxcode/nuxt-mongocamp-server) — mockNuxtImport is the right tool, same as
// test/components/MongocampCollectionData.test.ts's useMongocampApi mock. `navigateTo` itself
// is deliberately left real (not mocked) — Nuxt's own internals reference it during app boot,
// before this file's top-level consts finish initializing, so mocking it here trips a
// temporal-dead-zone error. A real `navigateTo('/secured')` against a route this fixture
// doesn't define just resolves with no match — it doesn't throw.
mockNuxtImport('useMongocampAuth', () => {
  return () => ({ login: mockLogin })
})

beforeEach(() => {
  vi.clearAllMocks()
  document.cookie = 'mongocamp_login=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
})

describe('MongocampLogin', () => {
  it('does not render a debug-data panel (regression: used to dump the typed password into the DOM)', async () => {
    const component = await mountSuspended(withUApp(MongocampLogin), { route: '/' })
    expect(component.text()).not.toContain('Debug Data')
  })

  it('logs in with the entered credentials and shows no error on success', async () => {
    mockLogin.mockResolvedValueOnce(undefined)
    const component = await mountSuspended(withUApp(MongocampLogin), { route: '/' })
    const form = component.find('form')

    await findInputByLabel(form, 'Email').setValue('user@example.com')
    await wait()
    await findInputByLabel(form, 'Password').setValue('secret')
    await wait(200) // FormKit debounces validation across both fields before the form is submittable
    // A native click on the FormKit submit button doesn't trigger form submission under
    // happy-dom for this (non-modal) form — dispatching `submit` on the <form> directly is
    // the reliable, standard vue-test-utils way to exercise a submit handler.
    await form.trigger('submit')
    await flushPromises()

    expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'secret')
    expect(component.text()).not.toContain('Wrong Login or Password')
  })

  it('shows a generic error message on failure, without leaking the raw error into the DOM', async () => {
    mockLogin.mockRejectedValueOnce(new Error('invalid_grant: bad credentials'))
    const component = await mountSuspended(withUApp(MongocampLogin), { route: '/' })
    const form = component.find('form')

    await findInputByLabel(form, 'Email').setValue('user@example.com')
    await wait()
    await findInputByLabel(form, 'Password').setValue('wrong')
    await wait(200)
    await form.trigger('submit')
    await flushPromises()

    expect(component.text()).toContain('Wrong Login or Password !')
    expect(component.text()).not.toContain('invalid_grant')
  })

  it('persists the entered userId in the mongocamp_login cookie on success', async () => {
    mockLogin.mockResolvedValueOnce(undefined)
    const component = await mountSuspended(withUApp(MongocampLogin), { route: '/' })
    const form = component.find('form')

    await findInputByLabel(form, 'Email').setValue('user@example.com')
    await wait()
    await findInputByLabel(form, 'Password').setValue('secret')
    await wait(200)
    await form.trigger('submit')
    await flushPromises()

    expect(decodeURIComponent(document.cookie)).toContain('mongocamp_login=user@example.com')
  })
})
