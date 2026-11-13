import type { DefaultConfigOptions } from '@formkit/vue'
import { nuxtUIInputs, nuxtUIOutputs } from '@sfxcode/nuxt-ui-formkit/definitions'
import { addNuxtAsteriskPlugin } from '@sfxcode/nuxt-ui-formkit/plugins'

// The FormKit config the module's own forms need: the Nuxt UI input types (`nuxtUIInput`,
// `nuxtUISwitch`, `nuxtUIListbox`, `nuxtUISelectMenu`, the repeater, ...) and the asterisk on required
// fields. `module.ts` points `@formkit/nuxt` at this file when the app has no `formkit.config.*` of its
// own. An app that writes one replaces this completely and must register the inputs itself.
const config: DefaultConfigOptions = {
  inputs: { ...nuxtUIInputs, ...nuxtUIOutputs },
  // The module's forms use Nuxt UI icons, not FormKit's own icon set
  iconLoader: () => undefined,
  plugins: [addNuxtAsteriskPlugin],
}

export default config
