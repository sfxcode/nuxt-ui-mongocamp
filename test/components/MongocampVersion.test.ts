import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampVersion from '../../src/runtime/components/MongocampVersion.vue'

// Throwaway pipeline smoke test (phase 1 of 04-component-test-coverage): proves Nuxt boot +
// happy-dom + mountSuspended all work together before phase 2 tackles composable mocking.
describe('MongocampVersion', () => {
  it('mounts without crashing', async () => {
    const component = await mountSuspended(MongocampVersion)
    expect(component.html()).toBeTruthy()
  })
})
