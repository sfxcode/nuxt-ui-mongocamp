import type { DefaultConfigOptions } from '@formkit/vue'
import { nuxtUIInputs, nuxtUIOutputs } from '@sfxcode/nuxt-ui-formkit/definitions'

// Minimal FormKit config for this fixture: just the custom input types this module's own
// components rely on ($formkit: 'nuxtUIInput'/'nuxtUISwitch'/'nuxtUIRepeater'/...). Without
// this, FormKit throws (error code 600, unknown input type) as soon as a component with a
// FUDataEdit/FUAutoForm schema mounts — matches playground/formkit.config.ts, minus the
// cosmetic addons (auto-animate, locale) that aren't needed for functional test coverage.
const config: DefaultConfigOptions = {
  inputs: { ...nuxtUIInputs, ...nuxtUIOutputs },
}

export default config
