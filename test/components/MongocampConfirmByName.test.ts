import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { UApp } from '#components'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampConfirmByName from '../../src/runtime/components/MongocampConfirmByName.vue'

// UModal's transitions are timer-based and its content is teleported to body — see
// brain/patterns/component-testing-nuxt-environment.md.
enableAutoUnmount(afterEach)

function wait(ms = 50) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function modal() {
  return new DOMWrapper(document.body)
}

const open = ref(true)

function mountModal(onConfirm: () => Promise<void>) {
  open.value = true
  const Host = defineComponent({
    setup() {
      return () => h(UApp, () => h(MongocampConfirmByName, {
        'open': open.value,
        'onUpdate:open': (value: boolean) => { open.value = value },
        'name': 'scratch',
        'title': 'Drop collection',
        'description': 'This cannot be undone.',
        'confirmLabel': 'Drop it',
        onConfirm,
      }))
    },
  })
  return mountSuspended(Host)
}

function confirmButton() {
  return modal().findAll('button').find(b => b.text().includes('Drop it'))!
}

async function type(value: string) {
  const input = modal().find('input')
  await input.setValue(value)
  await flushPromises()
}

describe('MongocampConfirmByName', () => {
  it('keeps the confirm button disabled until the exact name is typed', async () => {
    await mountModal(vi.fn().mockResolvedValue(undefined))
    await wait()

    expect(confirmButton().attributes('disabled')).toBeDefined()
    await type('scratc')
    expect(confirmButton().attributes('disabled')).toBeDefined()
    await type('Scratch')
    expect(confirmButton().attributes('disabled')).toBeDefined()
    await type('scratch')
    expect(confirmButton().attributes('disabled')).toBeUndefined()
  })

  it('forgives surrounding whitespace from a paste', async () => {
    await mountModal(vi.fn().mockResolvedValue(undefined))
    await wait()

    await type('  scratch ')

    expect(confirmButton().attributes('disabled')).toBeUndefined()
  })

  it('does not confirm on Enter while the name does not match', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    await mountModal(onConfirm)
    await wait()

    await type('scratc')
    await modal().find('input').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirms on Enter once the name matches, then closes', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    await mountModal(onConfirm)
    await wait()

    await type('scratch')
    await modal().find('input').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(open.value).toBe(false)
  })

  it('stays open and shows the reason when the action fails', async () => {
    const onConfirm = vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { response: { status: 403 } }))
    await mountModal(onConfirm)
    await wait()

    await type('scratch')
    await confirmButton().trigger('click')
    await flushPromises()
    await wait()

    expect(open.value).toBe(true)
    expect(modal().text()).toContain('You do not have permission to do this.')
    expect(confirmButton().attributes('disabled')).toBeUndefined()
  })

  it('starts blank with no stale error when reopened', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('boom'))
    await mountModal(onConfirm)
    await wait()
    await type('scratch')
    await confirmButton().trigger('click')
    await flushPromises()

    open.value = false
    await flushPromises()
    open.value = true
    await flushPromises()
    await wait()

    expect((modal().find('input').element as HTMLInputElement).value).toBe('')
    expect(modal().text()).not.toContain('boom')
  })

  it('labels the input with the name to type', async () => {
    await mountModal(vi.fn().mockResolvedValue(undefined))
    await wait()

    expect(modal().find('input').attributes('aria-label')).toBe('Type "scratch" to confirm')
  })
})
